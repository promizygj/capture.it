import nodemailer from 'nodemailer';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';

// Without SMTP configured, mails are rendered to the log (useful in development / demos)
const transport = config.SMTP_URL ? nodemailer.createTransport(config.SMTP_URL) : nodemailer.createTransport({ jsonTransport: true });

export async function sendMail(to: string | string[], subject: string, text: string, html?: string) {
  const info = await transport.sendMail({ from: config.MAIL_FROM, to, subject, text, html });
  if (!config.SMTP_URL) logger.info('Email (SMTP not configured – logged only)', { to, subject, text });
  return info;
}
