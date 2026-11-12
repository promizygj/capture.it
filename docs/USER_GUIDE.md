# Capture.It — User Guide

Capture.It is one platform for **test management, execution, quality monitoring and reporting**.
You describe what a website should do, Capture.It checks it in real browsers, and you see quality
over time on a dashboard. No coding is needed.

This guide shows you how to use Capture.It to test a website:

1. [Create a project](#1-create-a-project)
2. [Organise tests into suites](#2-organise-tests-into-suites)
3. [Write test cases](#3-write-test-cases)
4. [Run them in real browsers](#4-run-them-in-real-browsers)
5. [Read the results](#5-read-the-results)
6. [Run tests automatically with schedules](#6-run-tests-automatically-with-schedules)
7. [Get notified when tests fail](#7-get-notified-when-tests-fail)
8. [Work as a team](#8-work-as-a-team)
9. [Run tests from your CI/CD pipeline](#9-run-tests-from-your-cicd-pipeline)

It then covers **every kind of QA test** you can run with Capture.It, and how to monitor and report
quality. It works for **any website or web app**: an online shop, a SaaS product, a company site, a
blog or an API.

| If you are… | Read |
|---|---|
| New to testing, or new to Capture.It | **Part A**: quick start, steps 1–9 above |
| Deciding what to test | **Part B**: plan your testing |
| Looking for how to test something specific | **Part C**: the QA test catalogue |
| Dealing with failures, or sharing results | **Part D**: investigate, monitor and report |
| Looking up a template, assertion or setting | **Part E**: reference |
| Moving existing Playwright/Cypress/Selenium tests | **Part F** |

---

## How Capture.It is organised

```
Project              one website or app you want to test
 ├─ Environments     where it runs: Production, Staging… (base URL + variables)
 ├─ Suites           groups of related tests: "Smoke", "Login", "Checkout"…
 │   └─ Test cases   one check each: "Homepage loads", "Wrong password is rejected"…
 └─ Runs             one execution of some suites, in one environment, in chosen browsers
     └─ Results      pass/fail per test case per browser, with screenshots, logs and errors
```

How the four jobs of the platform map onto it:

| Job | Where in Capture.It |
|---|---|
| **Test management** | Projects, environments, suites and test cases: what is tested, how, and how important it is |
| **Test execution** | Runs in Chromium, Firefox and WebKit, run by hand, on a schedule, or from CI/CD |
| **Quality monitoring** | Dashboard, Insights (flaky tests, recurring failures, trends), notifications |
| **Reporting** | Run and result pages with screenshots, logs, console/network errors, run comparison and failure analysis |

**Every test case starts in a brand-new browser.** Nothing is shared between test cases: no cookies,
no login, no cart. A test that needs a logged-in user must log in itself (see
[E.4](#e4-testing-pages-behind-a-login)).

---

# Part A — Quick start: your first project, step by step

Throughout Part A we use an example online shop at `https://www.example-shop.com`. Replace it with
your own website's address and pages.

## Before you start

**Sign in.** Open Capture.It in your browser.
- If you don't have an account yet, click **Create one** on the sign-in page.
- If you forget your password, use **Forgot password?**

## 1. Create a project

A project is one website you want to test.

1. In the sidebar, click **Projects**, then **New project**.
2. Fill in:
   - **Name**: `Example Shop`
   - **Website URL**: `https://www.example-shop.com`
   - **Description** (optional): `Public online shop`
3. Click **Create project**.

The project page opens. Its tabs:

| Tab | Used for |
|---|---|
| **Test suites** | Your suites and test cases, and starting runs |
| **Execution history** | Every run of this project |
| **Insights** | Flaky tests, repeated failures, pass-rate trend |
| **Environments** | The website address(es) and variables |
| **Schedules** | Running tests automatically |
| **Settings** | Browsers, parallel tests, retries, notifications, team |

### Check the settings

Open **Settings** and set:

| Setting | Start with | Why |
|---|---|---|
| **Default browsers** | Chromium | Fast. Add Firefox and WebKit once your tests are stable |
| **Parallel tests** | `2` for live sites, up to `5` for staging | Too many at once can overload a site or trigger its firewall |
| **Retries on failure** | `1` | Separates real failures from one-off glitches (marked **flaky**) |

Click **Save settings**.

### Add variables (optional, but recommended)

Variables store values you'll reuse in many tests, such as a test login or a search word.

1. Open **Environments** and edit **Production**. It already has your Website URL as its **Base URL**.
2. Click **Add variable** for each value:

| Variable name | Example value | Used for |
|---|---|---|
| `USERNAME` | `qa-tester@example.com` | Login tests |
| `PASSWORD` | the test account's password | Login tests |
| `SEARCH_QUERY` | `shoes` | Search tests |
| `PRODUCT_PATH` | `/products/blue-shoe` | A key page used by several tests |
| `API_TOKEN` | a token from the site's team | API tests needing authorization |

3. Use a variable in any test field by writing it in double curly braces, for example
   `{{USERNAME}}`.

If a value changes later, edit it once and every test picks it up. If your website also has a test
copy (a staging site), add it with **New environment** and its own **Base URL**. The same tests can
then run against either one, each with its own variable values.

## 2. Organise tests into suites

A suite is a group of related test cases that you can run together, like a folder.

1. Open the **Test suites** tab and click **New suite**.
2. Fill in:
   - **Name**: `Smoke`
   - **Category**: `Smoke` (a label for filtering)
   - **Description**: `The most important pages open`
3. Click **Save**.

Repeat for each area of the website. For the example shop:

| Suite | Category | What its tests check |
|---|---|---|
| **Smoke** | Smoke | The most important pages open without errors |
| **Navigation** | Regression | Menu links lead to the right pages |
| **Search** | Regression | Search finds products and handles no results |
| **Cart** | Regression | Products can be added to the cart |
| **Account** | Regression | Login works, and a wrong password is rejected |
| **Contact form** | Regression | The form shows errors for missing fields |

For a different kind of site, name suites after what visitors do there, for example *Sign-up*,
*Booking*, *Pricing* or *Blog*. [Part B](#b3-a-suite-structure-that-suits-most-sites) has a fuller
structure. Start with a **Smoke** suite, because it gives the most value for the least effort.

**On the suite list you can:**
- Use **the switch** to turn a suite on or off.
- Click **Run** to run one suite.
- Use **the pencil** to edit a suite and **the bin** to delete it.
- Use **the category chips** at the top to filter the list.

## 3. Write test cases

A test case is one check, such as "the homepage loads" or "a wrong password shows an error".

### 3.1 Create a test case

1. Open a suite, for example **Smoke**, and click **Add test case**.
2. **Choose a template.** A template is a ready-made type of test, so you only fill in a form.
   Pick **Page load & content check**.
3. Fill in the common fields:

| Field | Example | Meaning |
|---|---|---|
| **Test case name** | `Homepage loads` | What should be true, written as a fact |
| **Target URL** | `/` | The page to open. A path is added to the Base URL, so `/` is the homepage |
| **Priority** | Critical | **Critical**: the site is unusable without it · **High**: a main feature · **Medium**: everything else · **Low**: cosmetic |
| **Timeout (seconds)** | `30` | Use 60 for slow websites |
| **Expected result** | `The homepage opens and shows the shop name` | One plain sentence, shown in reports |

4. Fill in the template's own fields:
   - **Title contains**: `Example Shop`
   - **Page text contains**: a sentence that is always on the homepage, for example
     `Free delivery`
   - **Required element**: `header`
5. Look at **Generated steps**. It shows exactly what the browser will do.
6. Click **Save**.

That's a complete test. Add more the same way. Use **Duplicate** to copy a test and change one
detail.

### 3.2 Pick the right template

| To check that… | Use template | Example values |
|---|---|---|
| A page opens and shows the right content | **Page load & content check** | Target URL `/about` · Page text contains `About us` · Required element `h1` |
| A page has no JavaScript errors | **Page load & content check** | Tick **Fail on browser console errors** |
| A page loads fast enough | **Page load & content check** | Max load time `5000` (milliseconds) |
| A link goes to the right page | **Link navigation** | Link selector `nav a[href*="/shop"]` · Destination URL contains `/shop` |
| Search finds results | **Search returns results** | Search input `input[type=search]` · Query `{{SEARCH_QUERY}}` · Result item selector `.product` |
| Login works | **Login (valid credentials)** | Field selectors · Username `{{USERNAME}}` · Password `{{PASSWORD}}` · URL after login contains `/account` |
| A wrong password is rejected | **Login rejected (invalid credentials)** | Field selectors · Error message element `.error` · Error text contains `incorrect` |
| A form shows errors for empty fields | **Form submission & validation** | Leave **Fields** empty · Submit button `button[type=submit]` · Result element `.error` · Message contains `required` |
| A form rejects bad input | **Form submission & validation** | Fields `#email => not-an-email` · Result element `.error` |
| A click shows something (menu, tab, popup) | **Element interaction** | Interaction `click` · Target element `#menu-button` · Element that should become visible `#menu` |
| Adding to cart updates the cart | **Add product to cart** | "Add to cart" button `.add-to-cart` · Cart count element `.cart-count` · Expected count `1` |
| A full order works *(test site only)* | **Checkout flow** | Checkout fields · Place order button · Confirmation text `Thank you` |
| A page looks the same as before | **Visual regression snapshot** | The first run saves a reference screenshot |
| An API answers correctly | **API request** | Target URL `/api/products` · Expected status `200` · Body contains `"name"` |
| Anything else, in several steps | **Custom steps** | See [3.4](#34-custom-steps) |

[Part C](#part-c--the-qa-test-catalogue) has recipes for every other kind of test.

> **On a live website,** don't create tests that place real orders, send real messages or change real
> data. Check the form's *validation* instead, and run full purchases only on a test copy of the site.

### 3.3 Find selectors

Many fields ask for a **selector**, which tells the test which element on the page to use.

1. Open your website in Chrome or Firefox.
2. Right-click the element (a button, a field, a heading) and choose **Inspect**.
3. The highlighted code shows its attributes. Build a selector from them:

| The element's code shows | Selector to use |
|---|---|
| `id="email"` | `#email` |
| `name="email"` | `input[name=email]` |
| `class="price"` | `.price` |
| `data-testid="buy"` | `[data-testid=buy]` |
| `<button type="submit">` | `button[type=submit]` |
| `<a href="/pricing">` | `a[href*="/pricing"]` |
| A link inside the navigation | `nav a` |
| The text **Sign in** | `text=Sign in` |
| Only the visible copies | `.menu a:visible` |

**Tips that save hours:**
- Prefer `id`, `name` and `data-testid`, because they rarely change. Avoid long chains like
  `div > div:nth-child(3) > span`.
- **Hidden duplicates are common.** Many sites have two copies of the menu, search box or cart icon
  (desktop and mobile), with one hidden. A test uses the **first** match. If a test says "not
  visible" but the screenshot shows the element, add `:visible` to the selector or check text
  instead.
- If there's no good selector, check the page **text** with *Page text contains* or `textContains`.

### 3.4 Custom steps

Use the **Custom steps** template for a journey with several actions. The browser opens the **Target
URL**, does your **steps** in order, then checks your **assertions**.

Example: *"A customer can search and open a product"*, with Target URL `/`:

| # | Step | Selector | Value |
|---|---|---|---|
| 1 | `fill` | `input[type=search]` | `{{SEARCH_QUERY}}` |
| 2 | `press` | `input[type=search]` | `Enter` |
| 3 | `click` | `.product a` | |
| 4 | `waitForUrl` | | `/product` |

| Assertion | Selector | Value |
|---|---|---|
| `visible` | `h1` | |
| `textContains` | `.price` | `$` |

All available steps and assertions are listed in [E.3](#e3-custom-steps-reference). Testing pages
behind a login is covered in [E.4](#e4-testing-pages-behind-a-login).

## 4. Run them in real browsers

1. Open the project's **Test suites** tab.
2. Click **Run all suites** to run everything, or **Run** next to one suite.
3. In the dialog:
   - **Environment**: Production (or your test site)
   - **Browsers**: tick **Chromium**, **Firefox** and/or **WebKit** (Safari's engine)
4. Click **Start run**.

The run page opens and updates live. Each test goes **Queued → Running → Passed**, **Failed** or
**Skipped** (skipped means the test is switched off).

- Each test runs once in **every browser you ticked**. API tests run once.
- To run the same tests again later, open the run and click **Re-run**.
- First runs often show a few failures caused by the tests themselves. That's normal; see
  [D.1](#d1-investigate-failures).
- Start with **Chromium**. Once everything passes, run again with all three browsers to catch
  problems that only happen in one browser.

## 5. Read the results

### The run page

It shows the totals (passed, failed, skipped), the duration, and one row per test and browser.
Click any row to open that test's result.

### The result page

| Section | Tells you |
|---|---|
| **Status and error** | What went wrong, for example *Expected text "Free delivery" but it was not found* |
| **Screenshot** | What the page looked like at the moment it failed |
| **Logs** | Each step the browser took, with timings |
| **Console errors** | JavaScript errors the page produced |
| **Network failures** | Files or requests that failed to load (404, 500…) |
| **Metrics** | Load time, time to first byte, page size, number of requests |
| **Browser info** | Browser and version, window size, attempts |

Click **Analyse failure** for a plain-language summary of the likely cause and what to do next.

### Visual tests

The first run of a **Visual regression snapshot** saves a reference screenshot. Later runs compare
against it and show a difference image when something changed. If the change was intended, click
**Approve as baseline**.

### Results over time

- **Dashboard**: success rate, passed/failed totals, average duration and trend across all projects.
- **Execution history**: every run. Filter by status or date, or tick two runs and click **Compare**
  to see what was fixed and what newly broke.
- **Insights** (project tab): flaky tests, tests that keep failing with the same error, and the
  pass-rate trend.

## 6. Run tests automatically with schedules

A schedule runs your tests on its own, for example every night or every hour, so problems are found
even when nobody is watching.

1. Open your project and click the **Schedules** tab.
2. Click **New schedule**.
3. Fill in the form:

| Field | What to choose | Example |
|---|---|---|
| **Name** | A name that says what and when | `Hourly smoke check` |
| **Suite** | One suite, or **All enabled suites** | `Smoke` |
| **Environment** | Which site to test | `Production` |
| **Browsers** | One or more browsers | Chromium |
| **Frequency** | Click a preset: **Every hour**, **Every 6 hours**, **Daily at 02:00**, **Weekdays at 09:00** or **Weekly (Mon 06:00)** | Every hour |
| **Cron expression** | Filled in by the preset. Edit it for a custom time; the order is *minute hour day month weekday* | `0 * * * *` |
| **Time zone** | Filled in with your computer's time zone, so "02:00" means *your* 02:00. Change it if needed | `Africa/Lagos` |

4. Click **Create schedule**.

The schedule appears in the list with its **last run** and **next run** times. Use its switch to
**pause** or **resume** it, and its delete button to remove it. Every scheduled run appears in
**Execution history** like a manual run.

**A good starting setup:**

| Schedule | Suite | Frequency |
|---|---|---|
| Hourly smoke check | Smoke | Every hour (or every 6 hours) |
| Nightly regression | All enabled suites | Daily at 02:00 |
| Weekly cross-browser | All enabled suites, all three browsers ticked | Weekly (Mon 06:00) |

**Custom times with a cron expression.** The five parts are minute, hour, day of the month, month
and day of the week:

| Cron | Runs |
|---|---|
| `*/30 * * * *` | Every 30 minutes |
| `0 8 * * *` | Every day at 08:00 |
| `0 9,17 * * 1-5` | Weekdays at 09:00 and 17:00 |
| `0 3 * * 0` | Sundays at 03:00 |
| `0 6 1 * *` | The 1st of every month at 06:00 |

On a live website, don't schedule big suites too often. Hourly is plenty for a smoke check.

## 7. Get notified when tests fail

Capture.It can tell you when a run fails, whether it was started by hand, by a schedule or by CI/CD.
Runs that pass don't send anything.

1. Open your project and click the **Settings** tab.
2. In the **Notifications** box:
   - **Email:** turn on **Email all project members when a run fails**. Every member of the project
     (see step 8) gets an email listing the failed tests, with a link to the full report.
   - **Slack:** paste a **Slack incoming webhook URL**, which starts with
     `https://hooks.slack.com/services/…`. Failed runs are then posted to that Slack channel.
3. Click **Save settings**.

**Getting a Slack webhook URL:**
1. Go to **api.slack.com/apps**, click **Create New App** and choose **From scratch**.
2. Open **Incoming Webhooks** and switch it on.
3. Click **Add New Webhook to Workspace**, pick the channel (for example `#qa-alerts`) and allow it.
4. Copy the webhook URL and paste it into Capture.It.

**To test your alerts:** add a test case that is sure to fail, for example a *Page load* check for
text that isn't on the page. Run it, confirm the email or Slack message arrives, then delete the
test case.

**Not getting emails?** Email needs the Capture.It server's mail settings (`SMTP_URL`) to be
configured by whoever runs your Capture.It installation. Slack works without them.

## 8. Work as a team

Invite colleagues so they can see results, write tests and receive failure emails.

1. Open your project and click the **Settings** tab.
2. In the **Team** box:
   - Type your colleague's email in the **colleague@company.com** field.
   - Choose their role.
   - Click **Add**.
3. The colleague must already have a Capture.It account. If they don't, you'll see *"No user with
   that email exists"*. Ask them to sign up with **Create one** first, using the same email address.

**Roles:**

| Role | Can do |
|---|---|
| **Owner** | Everything an Editor can do, plus add/remove members, change roles, and delete the project |
| **Editor** | Create and edit suites and test cases, run tests, and manage environments, schedules, notifications and CI/CD keys |
| **Viewer** | See test cases, runs and reports, but can't change or run anything |

- To change someone's role, use the dropdown next to their name.
- To remove someone, click the bin icon.
- Every member receives the failure emails from step 7 when email notifications are on.

**Typical team setup:**
- QA engineers are **Editors**.
- The team lead is an **Owner**.
- Developers, managers or clients who only need to see results are **Viewers**.

## 9. Run tests from your CI/CD pipeline

Your build pipeline (GitHub Actions, GitLab CI, Jenkins…) can start a Capture.It run after every
deployment and stop the release if tests fail.

1. Open your project and click the **Settings** tab.
2. In the **CI/CD integration** box:
   - Type a **Key name**, for example `GitHub Actions`.
   - Click **Create key**.
3. **Copy the key immediately.** It is shown only once. If you lose it, delete it and create a new
   one.
4. In your code repository, save the key as a secret. In GitHub, go to **Settings → Secrets and
   variables → Actions → New repository secret** and name it `QA_PLATFORM_KEY`.
5. Back in Capture.It, expand **GitHub Actions example**, click **Copy**, and save it in your
   repository as `.github/workflows/e2e.yml`.

From then on, every push starts a run. The pipeline waits for the result and fails if any test
fails. The run also appears in **Execution history** and triggers the notifications from step 7.
Other CI tools can use the same two web requests shown in the example.

---

# Part B — Plan your testing

## B.1 Explore the site and fill in this worksheet

Open the website in your own browser and use it like a real visitor. Write the answers down; a notes
file or spreadsheet is fine.

| Question | Write down |
|---|---|
| **Which pages matter most?** | Home, the main sections, pages people land on from ads or search |
| **What do visitors come to do?** | Their main journeys, for example "find a product and add it to the cart", "sign up", "contact sales", "read an article" |
| **What would hurt most if it broke?** | These become **Critical** tests: usually the homepage, sign-in, and whatever earns money or leads |
| **Is there a login?** | You'll need a **test account**, never a real customer's |
| **Is there a public API?** | Endpoints you can check directly |
| **Is there a staging/test copy?** | Add it as an environment. Risky tests (orders, real form submissions) belong there |
| **What must I never do on the live site?** | Place real orders, send real messages, charge cards, delete data |

## B.2 Checklists by type of site

**Online shop**
- Homepage, shop and category pages show products
- Product page shows title, price, image and the buy button
- Search finds products, and a nonsense search shows a friendly "no results" message
- Filters, sorting and pagination work
- Add to cart works, the cart shows the item, quantity changes and removal work
- An invalid coupon is rejected
- Login works, a wrong password is rejected, and account pages need a login
- Contact form validation works
- *Checkout and payment: staging only*

**SaaS / web application**
- Marketing pages and pricing load
- Sign-up form validation works (empty fields, bad email, weak password)
- Login works, a wrong password is rejected, and logout ends the session
- Protected screens redirect to login when signed out
- Key screens behind the login open (dashboard, settings)
- Main actions work: create an item, then see it in a list *(test account / staging)*
- API endpoints answer with the right status and data

**Company / marketing site**
- Every main page opens (home, about, services, pricing, contact)
- Menu and footer links go to the right pages
- The contact or quote form shows validation errors
- Pages are fast and have no JavaScript errors
- SEO basics: titles, descriptions, one heading per page
- Visual snapshots of the key pages

**Blog / content site**
- Home and article pages load
- Categories or tags list articles, and pagination works
- Search works
- Newsletter sign-up validation works
- SEO basics, plus `robots.txt` and the sitemap

**API only**
- Each important endpoint returns the right status code
- The response contains the expected fields or values
- Response time is acceptable
- Bad input returns 4xx, never 5xx
- Protected endpoints reject requests without a token

## B.3 A suite structure that suits most sites

| Suite | Category | What goes in it | Run it |
|---|---|---|---|
| **Smoke** | Smoke | One "page opens" test per important page | Often (every few hours) |
| **Navigation & links** | Regression | Menus, footer, key links, the 404 page, redirects | Daily |
| **Search & lists** | Regression | Search, filters, sorting, pagination | Daily |
| **Core journey** | Regression | The site's main job: cart, sign-up, booking, quote… | Daily |
| **Accounts** | Regression | Login, wrong login, logout, protected pages | Daily |
| **Forms** | Regression | Validation messages; real submissions on staging only | Daily |
| **API** | API | Endpoint status, data, response time | Daily |
| **Performance** | Performance | Load-time limits | Daily |
| **Visual** | Visual | Visual snapshots of key pages | Daily or weekly |
| **Accessibility & SEO** | Quality | Alt text, labels, headings, titles, meta tags | Weekly |
| **Security** | Security | Script-like input, protected pages, HTTPS | Weekly |

Skip suites that don't apply. Rename "Core journey" to what the site actually does, for example
"Cart", "Booking" or "Sign-up".

## B.4 Good habits

- **Start small:** a Smoke suite of 5–10 page checks catches most outages.
- **Test one thing per test case,** so a failure tells you exactly what broke.
- **Name tests as facts** ("Cart shows the added item"), not actions ("Test cart").
- **Write positive and negative tests.** Check that valid input works *and* that bad input is
  rejected.
- **Never place orders, send messages or change real data on a live site.** Use a staging
  environment.
- **Keep parallel tests low on live sites,** and talk to the site owner before running heavy
  schedules.
- **Use variables** for anything that changes: products, search words, accounts.
- **Prefer stable selectors** and stable text. Mask changing areas in visual tests.
- **Raise the timeout** for slow pages instead of adding pauses.

---

# Part C — The QA test catalogue

This part covers every kind of QA test and how to build it in Capture.It. Each recipe lists the
**template**, the **Target URL** and what to **fill in**. Replace the example selectors and text with
your site's own ([3.3](#33-find-selectors) shows how to find them).

**Tools used in this part, beyond the basic templates:**
- `count` counts **all** matching elements, including invisible ones such as `<meta>` tags. Use it
  for SEO and accessibility checks.
- `hidden` also passes when an element **doesn't exist at all**. Combined with `text=` it checks that
  some text is *not* on the page, e.g. `hidden` `text=Fatal error`.
- The **API request** template works for **any URL**, not just APIs. Use it to check that a page
  returns `404`, or that a file or link answers `200`.

## C.1 Smoke testing

*Is the site up, and do its most important pages work?* Run it most often.

| Check | Template | Target URL | Fill in |
|---|---|---|---|
| Homepage loads | Page load | `/` | Title contains the site name · Page text contains a stable sentence · Required element `header` |
| Each key page opens | Page load | `/about`, `/pricing`, `/contact`… *(one test each)* | Required element `h1` · Page text contains a stable phrase |
| Key page has no JavaScript errors | Page load | `/` | Tick **Fail on browser console errors** |
| The site's main API is up | API request | `/api/health` (or any key endpoint) | Expected status `200` |

## C.2 Functional testing: pages and content

*Does each page show what it should?*

| Check | Template | Target URL | Fill in |
|---|---|---|---|
| Correct heading | Custom steps | the page | `textContains` `h1` `Our services` |
| Exact text (a price, plan name, phone number) | Custom steps | the page | `textEquals` `.plan-pro .price` `$29` |
| A list shows the right number of items | Custom steps | `/pricing` | `count` `.plan` `3` |
| A list is not empty | Page load | `/products` | Required element `.product-card` |
| Images are present | Custom steps | the page | `visible` `.hero img`. Broken images appear under **Network failures** in the result |
| Footer contact details | Custom steps | `/` | `textContains` `footer` `support@example.com` |
| No error text on the page | Custom steps | the page | `hidden` `text=Fatal error` · `hidden` `text=Warning:` · `hidden` `text=undefined` |
| Copyright year is current | Custom steps | `/` | `textContains` `footer` `2026` *(update yearly)* |

## C.3 Navigation and link testing

*Do menus and links take people to the right place?*

| Check | Template | Target URL | Fill in |
|---|---|---|---|
| Menu link works | Link navigation | `/` | Link selector `nav a[href*="/pricing"]` · Destination URL contains `/pricing` · Element visible on destination `h1` |
| Footer link works | Link navigation | `/` | Link selector `footer a[href*="/privacy"]` · Destination URL contains `/privacy` |
| Logo returns to the homepage | Custom steps | `/about` | Steps: `click` `header a.logo` · Assertions: `urlContains` your domain · `visible` the homepage hero |
| Dropdown / mega-menu opens | Element interaction | `/` | Interaction `hover` · Target `nav .has-submenu` · Element that should become visible `nav .submenu` |
| Mobile menu button opens the menu | Element interaction | `/` | Interaction `click` · Target `.menu-toggle` · Element that should become visible `.mobile-menu` *(only if the button shows at desktop size)* |
| A link is not broken | API request | the link's URL, e.g. `/downloads/brochure.pdf` | Expected status `200`. Make one test per important link |
| Missing pages show a proper 404 | API request | `/this-page-does-not-exist` | Expected status `404` |
| The 404 page is friendly | Custom steps | `/this-page-does-not-exist` | `textContains` `Page not found` · `visible` `a[href="/"]` |
| HTTP redirects to HTTPS | Custom steps | `http://www.example.com/` | `urlContains` `https://` |
| An old URL redirects to its new page | Custom steps | `/old-page` | `urlContains` `/new-page` |
| Breadcrumbs lead back | Custom steps | a deep page | Steps: `click` `.breadcrumb a >> nth=0` · Assertions: `urlContains` the parent path |
| External link opens a new tab | Custom steps | the page | `count` `a[href*="partner.com"][target=_blank]` `1` |

## C.4 Form and input-validation testing

*Do forms accept good input, and reject bad input with clear messages?* Submit only invalid data on a
live site. Real submissions belong on staging.

| Check | Template | Target URL | Fill in |
|---|---|---|---|
| Required fields are enforced | Form submission & validation | the form page | Fields empty · Submit button · Result element `.error` · Message contains `required` |
| Invalid email is rejected | Form submission & validation | the form page | Fields `#email => not-an-email` (plus valid values for the other required fields) · Result element `.error` |
| Phone/number fields reject letters | Form submission & validation | the form page | Fields `#phone => abcdef` · Result element: its error |
| Password rules are enforced (sign-up) | Form submission & validation | `/register` | Fields `#password => 123` · Message contains `at least` |
| Passwords must match | Form submission & validation | `/register` | Fields `#password => Passw0rd!` and `#confirm => Different1!` · Message contains `match` |
| Very long input is handled | Form submission & validation | the form page | Fields `#name =>` a 300-character text · Result: an error message, or check the page has no server error (C.16) |
| Special characters are accepted | Form submission & validation | the form page | Fields `#name => Zoë O'Brien-Šimić` · Result element: the success or next-step message *(staging)* |
| A dropdown option can be chosen | Custom steps | the form page | Steps: `select` `#country` `Canada` · Assertions: `valueEquals` `#country` `CA` (the option's value) |
| A checkbox is required (terms) | Custom steps | the form page | Fill the other fields, leave the checkbox unticked, `click` submit · Assertions: `visible` the terms error |
| Successful submission *(staging)* | Form submission & validation | the form page | All fields valid · Result element `.success` · Message contains `Thank you` |
| The form keeps entered values after an error | Custom steps | the form page | Steps: `fill` `#name` `Alex` → `click` submit · Assertions: `valueEquals` `#name` `Alex` |

## C.5 Authentication and session testing

| Check | Template | Target URL | Fill in |
|---|---|---|---|
| Login works | Login (valid credentials) | the login page | Field selectors · `{{USERNAME}}` / `{{PASSWORD}}` · URL after login contains `/account` or Element visible after login (e.g. a logout link) |
| Wrong password is rejected | Login rejected | the login page | Field selectors · Username `{{USERNAME}}` · Password `wrong-password` · Error message element and text |
| Unknown user is rejected | Login rejected | the login page | Username `nobody@example.com` · Error message element and text |
| Empty login is rejected | Form submission & validation | the login page | Fields empty · Submit button · Result element: the error |
| Protected pages need a login | Custom steps | `/account` | `urlContains` `login` (or `visible` the login form) |
| Logout ends the session | Custom steps | the login page | Login steps ([E.4](#e4-testing-pages-behind-a-login)) → `click` the logout link → `goto` `/account` · Assertions: `urlContains` `login` |
| Logged-in user sees their account | Custom steps | the login page | Login steps → `goto` `/account` · Assertions: `textContains` `{{USERNAME}}` or the account holder's name |
| Password-reset page works | Form submission & validation | `/forgot-password` | Fields `#email => {{USERNAME}}` · Result element: the confirmation message *(the email itself can't be checked; see C.20)* |
| Error messages don't reveal whether an account exists | Login rejected (twice) | the login page | Compare the error for a wrong password with the error for an unknown user. Ideally they're the same |

## C.6 Search, filtering, sorting and pagination

| Check | Template | Target URL | Fill in |
|---|---|---|---|
| Search returns results | Search returns results | `/` | Search input · Query `{{SEARCH_QUERY}}` · Result item selector · Results contain text |
| No-result search is handled | Page load | the results URL for a nonsense word, e.g. `/search?q=zzqqnoresult` | Page text contains the "no results" wording |
| Empty search is handled | Custom steps | `/search?q=` | `statusBelow` `500` · `hidden` `text=Fatal error` |
| Search with special characters | Custom steps | `/search?q=men's%20shoes` | `statusBelow` `500` · `visible` the results area |
| A filter narrows the list | Custom steps | `/products` | Steps: `click` `text=Blue` (the filter) → `waitForUrl` `color=blue` · Assertions: `visible` `.product-card` · `urlContains` `color=blue` |
| Sorting changes the order | Custom steps | `/products` | Steps: `select` `.sort` `price-asc` → `waitForUrl` `price` · Assertions: `textContains` `.product-card >> nth=0` the expected cheapest product |
| Next page works | Custom steps | `/blog` | Steps: `click` `.pagination a.next` → `waitForUrl` `page/2` · Assertions: `count` `.post` `10` |
| Result count is shown | Custom steps | `/search?q={{SEARCH_QUERY}}` | `textContains` `.results-count` `results` |

## C.7 E-commerce testing

| Check | Template | Target URL | Fill in |
|---|---|---|---|
| Product page is complete | Custom steps | `{{PRODUCT_PATH}}` | `visible` `h1` · `textContains` `.price` `$` · `visible` `.product-gallery img` · `visible` the add-to-cart button |
| Out-of-stock product can't be bought | Custom steps | an out-of-stock product | `textContains` `Out of stock` · `hidden` the add-to-cart button (or check it's disabled via your site's class) |
| Product options must be chosen first | Custom steps | a product with sizes | Steps: `click` add-to-cart without choosing · Assertions: `visible` the "please choose" message |
| Add to cart (cart counter) | Add product to cart | `{{PRODUCT_PATH}}` | "Add to cart" button · Cart count element · Expected count `1` |
| Add to cart (no counter on the site) | Custom steps | `{{PRODUCT_PATH}}` | Steps: `click` add-to-cart → `waitForSelector` the "added" message · Assertions: `textContains` that message `added to your cart` |
| Cart lists the product | Custom steps | `{{PRODUCT_PATH}}` | Steps: `click` add-to-cart → `waitForSelector` the confirmation → `goto` `/cart` · Assertions: `textContains` the product name |
| Changing quantity updates the total | Custom steps | `{{PRODUCT_PATH}}` | Add to cart → `goto` `/cart` → `fill` `.qty` `2` → `click` `text=Update cart` · Assertions: `textContains` `.cart-total` the expected total |
| Removing an item empties the cart | Custom steps | `{{PRODUCT_PATH}}` | Add to cart → `goto` `/cart` → `click` `.remove` · Assertions: `textContains` `Your cart is empty` |
| Invalid coupon is rejected | Custom steps | `{{PRODUCT_PATH}}` | Add to cart → `goto` `/cart` → `fill` `#coupon` `NOTREAL` → `click` `text=Apply` · Assertions: `visible` the coupon error |
| Checkout page shows the order summary | Custom steps | `{{PRODUCT_PATH}}` | Add to cart → `goto` `/checkout` · Assertions: `textContains` the product name · `visible` the billing form |
| Checkout validation | Custom steps | `{{PRODUCT_PATH}}` | Add to cart → `goto` `/checkout` → `click` the place-order button with the form empty · Assertions: `visible` the error list. **No order is placed**, because validation stops it |
| Full order with a test card *(staging only)* | Checkout flow | `/checkout` | Buttons to click first · Fields (address, the payment provider's **test** card) · Place order button · Confirmation text `Thank you` |

Each test starts with an empty cart, so counts such as "1 item" are reliable.

## C.8 UI interaction testing

| Check | Template | Target URL | Fill in |
|---|---|---|---|
| Tab switches content | Element interaction | the page | Interaction `click` · Target `text=Specifications` · Element that should become visible `#tab-specifications` |
| Accordion / FAQ opens | Element interaction | `/faq` | Interaction `click` · Target `.faq-question >> nth=0` · Element that should become visible `.faq-answer >> nth=0` |
| Modal opens and closes | Custom steps | the page | Steps: `click` `text=Watch video` → `waitForSelector` `.modal` → `click` `.modal .close` · Assertions: `hidden` `.modal` |
| Cookie banner can be accepted | Custom steps | `/` | Steps: `click` `text=Accept` · Assertions: `hidden` `.cookie-banner` |
| Tooltip appears on hover | Element interaction | the page | Interaction `hover` · Target the icon · Element that should become visible `.tooltip` |
| Image slider moves | Custom steps | `/` | Steps: `click` `.slider .next` · Assertions: `visible` `.slide >> nth=1` |
| Content loads on scroll | Custom steps | `/blog` | Steps: `scrollIntoView` `footer` → `waitForSelector` `.post >> nth=10` · Assertions: `count` `.post` greater than the first page (set the exact number) |
| Keyboard Enter submits search | Custom steps | `/` | Steps: `fill` the search input → `press` (same input) `Enter` · Assertions: `urlContains` `q=` |

## C.9 Cross-browser testing

*Does the site work the same in Chrome, Firefox and Safari?*

1. Make sure your suites pass in **Chromium** first.
2. Run them with **Chromium**, **Firefox** and **WebKit** ticked. Or set all three as **Default
   browsers** on **Settings**, so schedules use them too.
3. On the run page, look for tests that fail in **one browser only**. Those are compatibility bugs.
4. Use **Visual regression** tests in each browser to catch layout differences. Each browser keeps
   its own baseline.

## C.10 Visual regression testing

*Did the page's appearance change unexpectedly?*

| Check | Template | Target URL | Fill in |
|---|---|---|---|
| Homepage looks the same | Visual regression snapshot | `/` | **Capture full page** off for the top of the page, or on for the whole page · Max differing pixels `0.01`–`0.03` |
| Key pages look the same | Visual regression snapshot | `/pricing`, `/product/...` *(one each)* | As above |
| Ignore changing areas | Visual regression snapshot | the page | **Regions to mask**, one selector per line: `.carousel`, `.date`, `.ad`, `.live-chat` |

How it works:
1. The first run saves the **baseline** screenshot.
2. Later runs fail when the difference is bigger than *Max differing pixels* (0.02 means 2 % of
   pixels), and show a **difference image**.
3. If the change was intended (a redesign), open the result and click **Approve as baseline**.

## C.11 Performance testing

*Is the site fast enough?* Capture.It measures speed from one real browser at a time. It's not a
load test with many users (see C.20).

| Check | Template | Target URL | Fill in |
|---|---|---|---|
| Page loads under a limit | Page load | `/` | Max load time `3000`–`5000` ms |
| Each key page loads under a limit | Page load | each key page | Max load time |
| API responds quickly | API request | `/api/products` | Max response time `1000` ms |
| Speed after an action | Custom steps | `/` | Steps: `goto` `/search?q={{SEARCH_QUERY}}` · Assertions: `loadTimeBelow` `4000` (it measures the last `goto`) |
| Speed trend | — | — | Open any result's **Metrics** (load time, time to first byte, page size, number of requests) and the **Insights** tab over time |

Schedule performance tests regularly. One slow run can be a blip; a trend of slow runs is a
problem.

## C.12 Accessibility testing (basic automated checks)

These catch common accessibility mistakes. They don't replace a full WCAG audit or testing with a
screen reader.

| Check | Template | Target URL | Fill in |
|---|---|---|---|
| Every image has alt text | Custom steps | the page | `count` `img:not([alt])` `0` |
| The page language is set | Custom steps | the page | `count` `html[lang]` `1` |
| Exactly one main heading | Custom steps | the page | `count` `h1` `1` |
| Form fields have labels | Custom steps | the form page | `count` `input[type=text]:not([aria-label]):not([id])` `0`. Then confirm with your site's markup that every field id has a matching `<label for=…>` |
| Buttons have accessible names | Custom steps | the page | `count` `button:not([aria-label]):empty` `0` |
| Links aren't empty | Custom steps | the page | `count` `a:not([aria-label]):empty` `0` |
| The page can be zoomed | Custom steps | the page | `count` `meta[name=viewport][content*="user-scalable=no"]` `0` |
| Keyboard focus reaches the page | Custom steps | the page | Steps: `press` (no selector) `Tab` · Assertions: `visible` `:focus` |
| A "skip to content" link exists | Custom steps | the page | `count` `a[href="#main"], a.skip-link` `1` |

## C.13 SEO and content testing

| Check | Template | Target URL | Fill in |
|---|---|---|---|
| Page title is right | Page load | the page | Title contains the expected words |
| Meta description exists | Custom steps | the page | `count` `meta[name=description]` `1` |
| Canonical link exists | Custom steps | the page | `count` `link[rel=canonical]` `1` |
| Social sharing tags exist | Custom steps | the page | `count` `meta[property="og:title"]` `1` · `count` `meta[property="og:image"]` `1` |
| Page isn't hidden from search engines | Custom steps | the page | `count` `meta[name=robots][content*=noindex]` `0` |
| Mobile viewport is set | Custom steps | the page | `count` `meta[name=viewport]` `1` |
| One H1 per page | Custom steps | the page | `count` `h1` `1` |
| `robots.txt` is available | API request | `/robots.txt` | Expected status `200` · Body contains `User-agent` |
| Sitemap is available | API request | `/sitemap.xml` | Expected status `200` · Body contains `<urlset` or `<sitemapindex` |
| Favicon is available | API request | `/favicon.ico` | Expected status `200` |
| Structured data exists | Custom steps | the page | `count` `script[type="application/ld+json"]` `1` |

## C.14 Security testing (basic checks)

These are safe, non-destructive checks of common weaknesses. They don't replace a professional
penetration test. Only test sites you own or have permission to test.

| Check | Template | Target URL | Fill in |
|---|---|---|---|
| Site uses HTTPS | Custom steps | `http://www.example.com/` | `urlContains` `https://` |
| Script-like input is shown safely (XSS) | Custom steps | a URL that displays your input, e.g. `/search?q=<script>alert(1)</script>` | `statusBelow` `500` · `textContains` `<script>alert(1)</script>`. The input must appear as plain text, not run as code |
| SQL-like input causes no database error | Custom steps | `/search?q=' OR 1=1 --` | `statusBelow` `500` · `hidden` `text=SQL syntax` · `hidden` `text=database error` |
| Protected pages need a login | Custom steps | `/account`, `/admin` | `urlContains` `login`, or `visible` the login form |
| Protected API rejects missing tokens | API request | `/api/account` | No headers · Expected status `401` (or `403`) |
| Protected API accepts a valid token | API request | `/api/account` | Headers `Authorization => Bearer {{API_TOKEN}}` · Expected status `200` |
| Login errors don't leak information | Login rejected | the login page | Error text: the same generic message for a wrong password and an unknown user |
| No insecure (http://) resources | Custom steps | the page | `count` `img[src^="http:"], script[src^="http:"], link[href^="http:"]` `0` |
| No forms sending data over http | Custom steps | the page | `count` `form[action^="http:"]` `0` |
| New-tab links are safe | Custom steps | the page | `count` `a[target=_blank]:not([rel*=noopener]):not([rel*=noreferrer])` `0` |
| Admin/config files aren't exposed | API request | `/.env`, `/.git/config`, `/wp-config.php.bak` *(one each)* | Expected status `404` (or `403`) |
| API doesn't leak secrets | API request | a public endpoint | Expected status `200`, then read the response in the result's logs for keys or passwords. Add *Body contains* checks for known safe fields |
| Open redirect is blocked | Custom steps | `/login?redirect=https://evil.example` | Steps: the login steps · Assertions: `urlContains` your own domain |

## C.15 API testing

Use the **API request** template. API tests don't open a browser and run once per run, whichever
browsers you tick.

| Check | Fill in |
|---|---|
| Endpoint is up | Method `GET` · Expected status `200` |
| Response has the right content | Body contains `"name"` |
| A field has the right value | JSON assertions `status => ok` |
| An item in a list | JSON assertions `items[0].id => 1` (or `[0].id => 1` when the response is a list) |
| A list has the right length | JSON assertions `items.length => 10` (or `length => 10` for a top-level list) |
| Response time | Max response time `1000` ms |
| Not found | Target URL `/api/products/999999999` · Expected status `404` |
| Bad input | Method `POST` · Body `{"email":"not-an-email"}` · Expected status `400` (or `422`) |
| Wrong method | Method `DELETE` on a read-only endpoint · Expected status `405` (or `404`) |
| Authentication | Headers `Authorization => Bearer {{API_TOKEN}}` · Expected status `200`; and without the header `401` |
| Create an item *(staging)* | Method `POST` · Headers `Content-Type => application/json` · Body `{"name":"QA item"}` · Expected status `201` |
| Content type | Headers `Accept => application/json` · Body contains `{` |

Use variables (`{{API_TOKEN}}`, `{{API_BASE}}`) so the same tests run against staging and production.

## C.16 Error handling and stability

| Check | Template | Target URL | Fill in |
|---|---|---|---|
| 404 status for missing pages | API request | `/this-page-does-not-exist` | Expected status `404` |
| Friendly 404 page | Custom steps | `/this-page-does-not-exist` | `textContains` `not found` · `visible` a link home |
| No server error on a page | Page load | the page | The template already fails on HTTP 400 or above. Add Required element `main` |
| No JavaScript errors | Page load | the page | Tick **Fail on browser console errors** |
| No PHP or framework error text | Custom steps | the page | `hidden` `text=Fatal error` · `hidden` `text=Stack trace` · `hidden` `text=Exception` |
| Bad URL parameters are handled | Custom steps | `/products?page=-1` or `/products?sort=<x>` | `statusBelow` `500` |
| Failing resources | — | — | Every result lists **Network failures** (broken images, scripts, API calls) even when the test passes. Review them on important pages |
| Flaky behaviour | — | — | Set **Retries on failure** to `1`+. Tests that pass on retry are marked **flaky** and listed in **Insights** |

## C.17 Regression and release testing

*Did a new release break something that used to work?*

1. Run all suites **before** the release. This is your reference run.
2. Run all suites again **after** the release, on the same environment and browsers.
3. In **Execution history**, tick both runs and click **Compare**. You'll see:
   - **newly failing** tests: regressions to report
   - **fixed** tests
   - **still failing** tests
4. For automatic release checks, connect your pipeline (E.6) so every deployment triggers a run and
   fails the build when tests fail.

## C.18 Data-driven testing (same test, different data)

- **Several values:** create the test, then **Duplicate** it for each value, for example one search
  test per keyword, or one page-load test per language (`/en/`, `/fr/`, `/de/`).
- **Several environments:** put changing values in **variables**. The same suite then runs against
  Staging and Production with different data.
- **Several browsers:** tick more browsers in the run dialog.

## C.19 Monitoring (uptime and continuous checks)

1. On the **Schedules** tab, click **New schedule**. Choose:
   - **Smoke** every hour or every 6 hours.
   - **All suites** daily, for example at 02:00.
   - Choose the environment, browsers and **time zone** for each.
2. On **Settings**, turn on **Email notifications** or add a **Slack incoming webhook URL** to be
   told when a run fails.
3. Watch the **Dashboard** and **Insights** for trends (see D.2).

## C.20 What to test manually, or with other tools

Some checks can't be automated in Capture.It. Keep them on a manual checklist, or use a specialist
tool:

| Area | Why | What to do |
|---|---|---|
| Emails (sign-up confirmation, password reset, receipts) | Tests can't read an inbox | Check by hand with a test inbox. Automate the *page* part (C.5) |
| CAPTCHA, two-factor codes, SMS | Designed to block automation | Turn them off for the test account on staging, or test manually |
| Real payments | Charges real money | Use the payment provider's test mode on staging (C.7) |
| File uploads and downloads (content) | No upload step | Test manually. Check download links with an API request (status `200`) |
| Phone and tablet layouts | Runs use desktop-sized browsers | Test on real devices or with browser developer tools |
| Load and stress testing | Capture.It measures one visitor at a time | Use a load-testing tool, with the site owner's permission |
| Full accessibility audit | Automated checks catch only part of the issues | Manual review with a screen reader and keyboard, against WCAG |
| Response headers and cookie flags | Not readable by the templates | Use browser developer tools or a security scanner |
| Usability and look-and-feel | Needs human judgement | Exploratory testing sessions. Record findings as bugs |

---

# Part D — Investigate, monitor and report

## D.1 Investigate failures

Click a failed test to open its result page. You'll see:
- the error message
- a **screenshot** at the moment of failure
- the step **logs**
- **console errors** and **network failures**
- performance **metrics**

**Analyse failure** writes a summary with likely causes and next steps.

**Is it the website or the test?**

| You see | It usually means | Do this |
|---|---|---|
| "Element … not visible", but the screenshot shows it | The selector is wrong, or matches a hidden duplicate | Re-inspect the element, add `:visible`, or check text instead |
| "Text not found", and the screenshot shows different wording | The site's wording changed | Update the expected text, or check for a shorter, stable phrase |
| Timeout, and the screenshot is blank or half-loaded | The site is slow, down or blocking automated traffic | Re-run. If it repeats, report it. Raise the timeout for slow pages |
| HTTP 404 / 500 | A broken page or server error | **Report it, it's a real bug** |
| Console error | A JavaScript or browser error on the page | Read it. Some are serious (a broken script); some are minor (a rejected tracking cookie). Report both and say which |
| Passes on retry (marked **flaky**) | A timing issue, in the site or the test | Watch it on the **Insights** tab. Make the test wait for the right element |
| Fails in one browser only | A browser compatibility issue | **Report it** with the browser name from **Browser info** |
| Visual test fails | The page's appearance changed | If intended, **Approve as baseline**. If not, report it with the difference image |

**Fix test mistakes right away. Report real bugs to the site's team, and leave those tests failing
until the site is fixed.** A failing test is doing its job.

## D.2 Monitor quality over time

1. **Schedule** runs on the **Schedules** tab:
   - Smoke every hour or 6 hours.
   - Everything daily.
2. **Get alerts** on **Settings**: **Email notifications** or a **Slack incoming webhook URL**.
3. **Check the Dashboard** for the success rate, passed/failed totals, average duration and trend
   across all projects.
4. **Check Insights** in each project weekly:
   - **flaky tests** to stabilise
   - **recurring failures**, the same error again and again, to escalate
   - **pass-rate trend**, to see whether quality is improving
5. **Keep the tests current.** When the site adds a page, form or feature, add a test case. When a
   feature is removed, disable or delete its tests.

## D.3 Report results

| Audience | What to share |
|---|---|
| Developers fixing a bug | The **result page** of the failed test: error, screenshot, logs, console and network errors, browser |
| Your team, after a release | **Compare** in **Execution history**: the run before and after the release |
| Managers / clients | **Dashboard** numbers: success rate, tests run, trend, and the **Insights** summary |

A good bug report, using what Capture.It gives you:

> **Title:** [Page/feature] — [what goes wrong]
> **Where:** environment + URL (from the result page)
> **Browser:** from Browser info
> **Steps:** the test's step log
> **Expected:** the test case's *Expected result*
> **Actual:** the error message + screenshot
> **Extra:** console errors / failed network requests, if any
> **Severity:** the test case's priority (Critical / High / Medium / Low)

---

# Part E — Reference

## E.1 The interface

| Area | What it shows |
|---|---|
| **Dashboard** | Totals across all projects: tests run, passed/failed/skipped, success rate, average duration, recent runs, trend |
| **Projects** | Your websites, with tabs **Test suites**, **Execution history**, **Insights**, **Environments**, **Schedules** and **Settings** |
| **Execution history** | Every run, filterable by project, status and date; tick two runs to **Compare** them |
| **Profile** (bottom of the sidebar) | Your name and password, and sign out |

On the suite list:
- **The switch** turns a suite on or off. Disabled suites are skipped by **Run all suites**.
- **Run** runs one suite. It is greyed out while the suite has no enabled test cases.
- **The pencil** edits a suite and **the bin** deletes it.
- **The category chips** filter the list.

Inside a test case:
- **Enabled** off means the test is recorded as *Skipped* instead of running.
- **The Generated steps** box shows exactly what the browser will do.

## E.2 Templates

| Template | Checks | Fields |
|---|---|---|
| **Page load & content check** | A page opens (status below 400) and shows the right content | Title contains · Page text contains · Required element · Max load time · Fail on console errors |
| **Link navigation** | Clicking a link reaches the right page | Link selector · Destination URL contains · Element visible on destination · Destination text contains |
| **Login (valid credentials)** | A user can sign in | Username / password / submit selectors · Username · Password · URL after login · Element visible after login |
| **Login rejected (invalid credentials)** | Wrong details show an error | As above + Error message element · Error text contains |
| **Form submission & validation** | Submitting shows success or validation errors | Fields (`selector => value`, one per line) · Submit button · Result element · Message contains |
| **Element interaction** | One click/hover/check/select/fill causes the right change | Interaction · Target element · Value · Element that should become visible · Expected text |
| **Add product to cart** | A cart counter updates | "Add to cart" button · Cart count element · Expected count · Page shows text |
| **Checkout flow** | A full order completes (**staging only**) | Buttons to click first · Checkout fields · Place order button · Confirmation element/text |
| **Search returns results** | Search finds items | Search input · Query · Result item selector · Results contain text |
| **Visual regression snapshot** | The page looks the same as the approved baseline | Full page · Max differing pixels (0–1) · Colour threshold (0–1) · Regions to mask |
| **API request** | An HTTP endpoint (or any URL) answers correctly | Method · Headers · Body · Expected status · Max response time · Body contains · JSON assertions (`path => expected`) |
| **Custom steps** | Anything else | Your own steps and assertions (E.3) |

Target URLs can be a path (added to the environment's base URL) or a full URL. `{{VARIABLES}}` work
in every field.

## E.3 Custom steps reference

The browser opens the **Target URL**, runs the **steps** in order, then checks the **assertions**.
Steps and assertions wait automatically until the element is there, up to the timeout. When a
selector matches several elements, the **first** one is used. Add `:visible` or `>> nth=1` to pick
another.

**Steps**

| Action | Selector | Value | Does |
|---|---|---|---|
| `goto` | — | URL or path | Opens a page |
| `click` | ✓ | — | Clicks an element |
| `fill` | ✓ | text | Types into an input (replaces what's there) |
| `select` | ✓ | option value or label | Picks an option in a dropdown |
| `check` / `uncheck` | ✓ | — | Ticks or unticks a checkbox |
| `hover` | ✓ | — | Moves the mouse over an element |
| `press` | optional | key, e.g. `Enter`, `Tab`, `Escape` | Presses a key in an element, or on the page if there's no selector |
| `waitForSelector` | ✓ | — | Waits until an element appears |
| `waitForUrl` | — | part of a URL | Waits until the address contains it |
| `waitForTimeout` | — | milliseconds | Pauses (avoid if you can) |
| `scrollIntoView` | ✓ | — | Scrolls to an element |

**Assertions**

| Assertion | Selector | Value | Passes when |
|---|---|---|---|
| `visible` | ✓ | — | The element is shown |
| `hidden` | ✓ | — | The element is not shown, **or doesn't exist** |
| `textContains` | optional | text | The element (or the whole page) contains the text. Not case-sensitive |
| `textEquals` | ✓ | text | The element's text is exactly this |
| `valueEquals` | ✓ | text | An input's value is exactly this |
| `count` | ✓ | number | Exactly that many elements match, **including invisible ones** |
| `urlContains` | — | text | The current address contains the text |
| `titleContains` | — | text | The page title contains the text |
| `statusBelow` | — | e.g. `400` | The last page load returned a status below this |
| `noConsoleErrors` | — | — | The browser console logged no errors |
| `loadTimeBelow` | — | ms | The last page load was faster than this |

**Useful selector extras**

| Write | Means |
|---|---|
| `text=Sign in` | The element with this text |
| `.item >> nth=2` | The third match (counting from 0) |
| `.menu a:visible` | Only visible matches |
| `a[href*="/blog"]` | Links whose address contains `/blog` |
| `input:not([alt])` | Elements *without* an attribute |
| `a, button` | Either one |

## E.4 Testing pages behind a login

Every test starts logged out, so start these tests with the login steps, then go to the page:

| # | Step | Selector | Value |
|---|---|---|---|
| 1 | `goto` | | `/login` (the site's login page) |
| 2 | `fill` | the email field, e.g. `#email` | `{{USERNAME}}` |
| 3 | `fill` | the password field, e.g. `#password` | `{{PASSWORD}}` |
| 4 | `click` | the submit button, e.g. `button[type=submit]` | |
| 5 | `waitForUrl` | | `/account` (where the site lands after login) |
| 6 | `goto` | | `/account/orders` (the page you want to test) |

Then add assertions about that page. Passwords typed by `fill` are never written to the logs. Use a
dedicated **test account**.

## E.5 Running and results

- **Run all suites** runs every enabled suite. **Run** runs a single suite. **Re-run** repeats a
  finished run.
- Each browser test runs once per selected browser. **API tests run once.**
- Result pages show:
  - status, error and **screenshot**
  - step **logs**
  - **console errors** and **network failures**
  - **metrics**: load time, time to first byte, page size, requests
  - **browser info**
  - **Analyse failure**
- **Visual tests:** the first run saves the baseline. If a later change was intended, click
  **Approve as baseline**.
- **Retries:** a test that fails, then passes on retry, is marked **flaky**.

## E.6 Settings, team and CI/CD

| Setting (Settings tab) | Does |
|---|---|
| Default browsers | Pre-selected browsers for runs |
| Parallel tests | How many tests run at once |
| Retries on failure | Automatic re-tries; also used to detect flaky tests |
| Email notifications | Email all members when a run fails |
| Slack incoming webhook URL | Post failed runs to a Slack channel |
| Team | Add members by email with a role (Owner / Editor / Viewer). See [step 8](#8-work-as-a-team) |
| API keys | **Create key** for CI/CD. Pipelines can start a run and fail the build when tests fail. A **GitHub Actions example** is shown on the page |

Schedules (Schedules tab):
- Presets: **Every hour**, **Every 6 hours**, **Daily at 02:00**, **Weekdays at 09:00**, **Weekly**.
- Or type your own **cron expression**.
- Each schedule has its own suite, environment, browsers and **time zone**.

---

# Part F — Bringing in existing automated tests

Capture.It builds tests from templates and steps in its interface. It **does not run test code
files** (Playwright `.spec.js`, Cypress, Selenium). To bring an existing code project in, recreate
its checks as test cases:

| In test code | In Capture.It |
|---|---|
| `baseURL`, `.env` values | An **environment**: base URL + **variables** |
| A spec file or `describe` block | A **suite** |
| A `test(...)` | A **test case** |
| `page.goto` / `click` / `fill` / `selectOption` / `check` / `hover` / `press` | Steps `goto` / `click` / `fill` / `select` / `check` / `hover` / `press` |
| `expect(locator).toBeVisible()` / `toBeHidden()` / `toContainText()` / `toHaveText()` / `toHaveCount()` / `toHaveValue()` | Assertions `visible` / `hidden` / `textContains` / `textEquals` / `count` / `valueEquals` |
| `expect(page).toHaveURL()` / `toHaveTitle()` | `urlContains` / `titleContains` |
| `request.get(...)` + status/body checks | The **API request** template |
| `toHaveScreenshot()` | The **Visual regression snapshot** template |
| A saved login (`storageState`, a setup project) | Login steps at the start of each test ([E.4](#e4-testing-pages-behind-a-login)) |
| Projects for several browsers | Tick the browsers in the run dialog |
| HTML reporter, retries | Built in |

**What doesn't translate:**
- **Loops and conditions,** such as "for each link on the page…". Make one test case per item that
  matters.
- **Regular expressions in text checks.** Use a plain, stable phrase.
- **Response-header and cookie-flag checks.**
- **Canvas drawing and file uploads.**
- **Mobile device emulation.** Runs use desktop-sized browsers.

Keep tests that need those in the code project, and move the page, journey, form and API checks
into Capture.It. They then get its scheduling, history, multi-browser runs, dashboards and reports.

---

# Appendix A — Selectors for common platforms

Sites built on the same platform share markup, so these are good starting points. Always confirm
with **Inspect**, because themes can change them.

**WooCommerce (WordPress shops)**

| What | Selector / path |
|---|---|
| Product grid item | `ul.products li.product` |
| Product title (product page) | `h1.product_title` |
| Price | `.summary .price` |
| Add to cart button | `button.single_add_to_cart_button` |
| "Added to cart" notice / error notice | `.woocommerce-message` / `.woocommerce-error` |
| Product search results | `/?s=<query>&post_type=product` |
| My Account login | `#username`, `#password`, `button[name=login]` |
| Public Store API | `/wp-json/wc/store/v1/products` |

**WordPress (any WordPress site)**

| What | Selector / path |
|---|---|
| Login page | `/wp-login.php` |
| Login fields | `#user_login`, `#user_pass`, `#wp-submit` |
| Login error | `#login_error` |
| Logged-in marker | `body.logged-in` |
| Site search | `/?s=<query>` |
| REST API | `/wp-json/` |

# Appendix B — Test case checklist

Before saving a test case, check:

- [ ] The name states what should be true ("Cart shows the added item")
- [ ] It checks **one** thing
- [ ] The priority reflects the impact if it breaks
- [ ] It uses variables for logins, products and search words
- [ ] Selectors are stable (ids, names, `data-testid`), and visible copies are targeted with `:visible`
- [ ] It's safe for the environment: no real orders, messages or data changes on production
- [ ] The timeout suits the page's speed
- [ ] The *Expected result* explains the check in one plain sentence
- [ ] It passes when the site works, and **fails when the feature is broken**. Try it once with a
      wrong expected value to be sure
