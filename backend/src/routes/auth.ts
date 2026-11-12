import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { badRequest, conflict, unauthorized } from '../lib/errors.js';
import { randomToken, sha256 } from '../lib/crypto.js';
import { clearAuthCookie, requireAuth, setAuthCookie, signToken } from '../middleware/auth.js';
import { sendMail } from '../services/mail.js';
import { config } from '../config.js';

export const authRouter = Router();
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser', 10);

const authLimiter = rateLimit({ windowMs: 15 * 60_000, limit: config.isProd ? 30 : 1000, standardHeaders: true, legacyHeaders: false });

const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128)
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/\d/, 'Password must contain a number');
const email = z.string().trim().toLowerCase().email();

const publicUser = (u: { id: string; email: string; name: string; createdAt: Date }) => ({ id: u.id, email: u.email, name: u.name, createdAt: u.createdAt });

authRouter.post('/register', authLimiter, async (req, res) => {
  const body = z.object({ name: z.string().trim().min(1).max(100), email, password }).parse(req.body);
  if (await prisma.user.findUnique({ where: { email: body.email } })) throw conflict('An account with this email already exists');
  const user = await prisma.user.create({
    data: { name: body.name, email: body.email, passwordHash: await bcrypt.hash(body.password, 12) },
  });
  setAuthCookie(res, signToken(user));
  res.status(201).json({ user: publicUser(user) });
});

authRouter.post('/login', authLimiter, async (req, res) => {
  const body = z.object({ email, password: z.string().min(1) }).parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: body.email } });
  // Compare against a dummy hash when the user doesn't exist to keep timing uniform
  const ok = await bcrypt.compare(body.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) throw unauthorized('Invalid email or password');
  setAuthCookie(res, signToken(user));
  res.json({ user: publicUser(user) });
});

authRouter.post('/logout', (_req, res) => {
  clearAuthCookie(res);
  res.status(204).end();
});

authRouter.post('/forgot-password', authLimiter, async (req, res) => {
  const body = z.object({ email }).parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: body.email } });
  if (user) {
    const token = randomToken();
    await prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 60 * 60_000) },
    });
    const link = `${config.APP_URL}/reset-password?token=${token}`;
    await sendMail(
      user.email,
      'Reset your Capture.It password',
      `Hi ${user.name},\n\nUse the link below to reset your password. It expires in 1 hour.\n\n${link}\n\nIf you didn't request this, you can ignore this email.`,
    );
  }
  // Always respond the same way so the endpoint can't be used to discover accounts
  res.json({ message: 'If an account exists for that email, a reset link has been sent.' });
});

authRouter.post('/reset-password', authLimiter, async (req, res) => {
  const body = z.object({ token: z.string().min(10), password }).parse(req.body);
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash: sha256(body.token) } });
  if (!record || record.usedAt || record.expiresAt < new Date()) throw badRequest('This reset link is invalid or has expired');
  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash: await bcrypt.hash(body.password, 12), passwordChangedAt: new Date() },
    }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    prisma.passwordResetToken.deleteMany({ where: { userId: record.userId, usedAt: null, id: { not: record.id } } }),
  ]);
  res.json({ message: 'Password updated. You can now sign in.' });
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  res.json({ user: publicUser(user) });
});

authRouter.patch('/me', requireAuth, async (req, res) => {
  const body = z.object({ name: z.string().trim().min(1).max(100).optional(), email: email.optional() }).parse(req.body);
  if (body.email && body.email !== req.user!.email) {
    if (await prisma.user.findUnique({ where: { email: body.email } })) throw conflict('That email is already in use');
  }
  const user = await prisma.user.update({ where: { id: req.user!.id }, data: body });
  res.json({ user: publicUser(user) });
});

authRouter.post('/me/password', requireAuth, async (req, res) => {
  const body = z.object({ currentPassword: z.string().min(1), newPassword: password }).parse(req.body);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  if (!(await bcrypt.compare(body.currentPassword, user.passwordHash))) throw badRequest('Current password is incorrect');
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(body.newPassword, 12), passwordChangedAt: new Date() },
  });
  // Issue a fresh session for this device; other sessions are invalidated by passwordChangedAt
  await new Promise((r) => setTimeout(r, 1100));
  setAuthCookie(res, signToken(updated));
  res.json({ message: 'Password changed' });
});
