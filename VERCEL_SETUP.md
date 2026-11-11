# Vercel deployment configuration

Import `mhamzanadeem/crumb`, select **Next.js**, root directory `.`, Node.js **24.x**, install command `npm ci`, and build command `npm run build`. Keep the framework's default output directory. Do not use `npm run dev` as a deployment command.

Add variables under **Project Settings → Environment Variables**, selecting **Production**. Add them separately to **Preview** only if you also want working preview deployments. Changes require a new deployment/redeployment.

## Required values

| Variable | Value to enter |
| --- | --- |
| `MONGODB_URI` | Copy your complete working Atlas URI from `.env.local`. Keep credentials private. |
| `MONGODB_DB` | `crumb` |
| `MONGODB_DNS_SERVERS` | Leave blank / omit. |
| `MONGODB_DNS_TRANSPORT` | `https` to retain the current opt-in HTTPS discovery workaround; omit to use Vercel's native DNS. |
| `SESSION_SECRET` | Copy the generated random secret from `.env.local`, or generate a separate random secret of at least 32 characters. Never use the placeholder. |
| `ADMIN_EMAIL` | The email you want to use to sign into the bakery owner studio. |
| `ADMIN_PASSWORD` | A new strong owner password of at least 12 characters. The local template value must not be used. |
| `APP_URL` | Your exact production URL, such as `https://YOUR-PROJECT.vercel.app`, without a trailing slash. Never use localhost here. |
| `PAYPAL_CLIENT_ID` | The client ID from your PayPal **sandbox** application. |
| `PAYPAL_CLIENT_SECRET` | The secret from that same sandbox application. |
| `SANDBOX_UNIT_PRICE_USD` | `12.00` |
| `DEMO_ENABLED` | `true` for hackathon judging. |
| `ALLOW_MEMORY_DB` | `false` |

Atlas Network Access must permit the Vercel application's outbound connections. Cloud database authentication and permission settings still apply even when HTTPS DNS is enabled.

## AI and AG Studio

| Variable | Value to enter |
| --- | --- |
| `OPENAI_API_KEY` | Copy your API key from the local environment or use a separate project key. |
| `OPENAI_MODEL` | `gpt-5.6-luna`, provided your API account supports it. |
| `AI_DAILY_REQUEST_LIMIT` | `100` |
| `NEXT_PUBLIC_AG_STUDIO_LICENSE_KEY` | Your actual AG Studio trial/license string. This is intentionally bundled into the frontend. |

AI is optional for manual ordering, but the interpretation feature requires its API key. Keep the AG Studio trial valid through hosted evaluation.

## Public sandbox buyer instructions

| Variable | Value to enter |
| --- | --- |
| `PAYPAL_SANDBOX_BUYER_EMAIL` | Your dedicated **Personal sandbox buyer** email. |
| `PAYPAL_SANDBOX_BUYER_PASSWORD` | That buyer account's test password. |
| `SHOW_SANDBOX_BUYER_CREDENTIALS` | `true` if judges should see this test login on the order checkout screen. |

These two buyer credentials are deliberately shown to demo visitors when enabled. Never enter a real account password, developer login, business sandbox password or client secret in those fields. In Vercel's value input, paste the literal password: do not add quotation marks or the backslash used to escape `$` in a local dotenv file.

## Optional uploads

| Variable | Value to enter |
| --- | --- |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary account cloud name. |
| `CLOUDINARY_API_KEY` | Cloudinary API key. |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret. |

These are needed only for merchant uploads. The repository's bundled bakery image works on Vercel without Cloudinary.

## Webhook after the domain is known

1. Open the **same sandbox application** in PayPal Developer Dashboard.
2. Register `https://YOUR-PROJECT.vercel.app/api/paypal/webhook`.
3. Subscribe to `PAYMENT.CAPTURE.COMPLETED`.
4. Put the resulting webhook ID into Vercel as `PAYPAL_WEBHOOK_ID`.
5. Redeploy. Ensure the webhook URL is reachable without Vercel deployment-authentication prompts.

The browser return flow can verify a payment without a webhook. Configuring the webhook also supports background confirmation.

## Deployment verification

1. Confirm the deployed URL matches `APP_URL` exactly and is available to judges.
2. Open the judge demo and submit an order.
3. Use the new-tab Merchant Studio handoff to approve it.
4. Pay with the dedicated sandbox Personal buyer account.
5. Verify that the return page becomes **completed** automatically and shows the capture reference.
6. Check merchant fulfillment and AG Studio. Never pay a second time just because a local record is still pending; use recovery on the existing order.

Commit `.env.example` only. Do not commit `.env.local` or paste server credentials into repository files.

Official references: [Vercel environment variables](https://vercel.com/docs/environment-variables), [Next.js on Vercel](https://vercel.com/docs/frameworks/full-stack/nextjs).
