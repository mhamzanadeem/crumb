# Devpost submission updates after APIMatic integration

These are the fields to change. Keep the project name, pitch, problem statement, demo URL and customer/merchant testing instructions unless you have another reason to edit them.

## About the project — How we built it

Crumb is built with Next.js and React, with MongoDB Atlas storing orders, merchant settings and payment state. The customer assistant uses fixed choices for routine ordering and calls the OpenAI Responses API only when a customer asks for help interpreting a custom cake request. The merchant reviews the request and approves a separate USD sandbox quote before checkout. PayPal integration uses the official APIMatic-generated PayPal Server SDK for creating, retrieving and capturing orders, plus refunds and refund-status checks. The server verifies the completed capture against the order reference, amount and currency before permitting production. AG Studio provides merchant analytics. We installed and consulted APIMatic's PayPal Context Plugin during the integration review and checked the official SDK's contracts against its installed source.

## Main technology requirement — replace the answer

Crumb integrates PayPal's free sandbox environment with the OpenAI Responses API. PayPal Orders v2 creates, retrieves and captures checkout orders, and Payments v2 handles merchant-approved refunds and refund-status checks through the official APIMatic-generated PayPal Server SDK (@paypal/paypal-server-sdk 2.5.0). Webhook signatures are verified through PayPal's Notifications REST endpoint. OpenAI interprets optional free-text custom cake requests into a bounded structured brief for bakery review; routine menu choices use deterministic controls. The currently configured model is gpt-5.6-luna. Merchant approval and server-verified capture are required before production.

Check that the configured model is available to your OpenAI account and the interpretation feature works on the deployed site before submitting this answer. Do not describe an AI fallback as a successful model call.

## Additional sponsor tools — change the selections

Select **APIMatic** and **AG Grid**, provided the AG Studio component is enabled with your valid license on the deployed app. Sponsor selection is not a guarantee of prize eligibility; do not claim every sponsor integration or Context Plugin criterion was independently certified.

## Built with — add these tags

APIMatic, PayPal, PayPal Server SDK. Keep the existing truthful tags such as Next.js, React, JavaScript, Node.js, MongoDB Atlas, OpenAI, AG Studio and Vercel. The Context Plugin is a development tool; it is not an API used by customers at runtime.

## APIMatic Context Plugin experience — replace the empty / not-used answer

We installed APIMatic's PayPal Context Plugin in Codex and consulted its TypeScript integration guidance while completing the payment adapter. An important distinction was that the current plugin guide describes a different generated client from the official PayPal Server SDK used by Crumb, so we verified method signatures, model mappings and client options against the installed SDK instead of mixing the two interfaces. The runtime integration uses APIMatic-generated authentication, schema validation and HTTP infrastructure through the official SDK. We validated sandbox authentication and order creation/readback, and exercised capture, payment recovery and refunds with the real SDK against mocked HTTP responses. We did not benchmark development time or complete a new buyer-approved sandbox capture/refund during this review.

## About the project — Challenges paragraph to add

Moving from direct REST requests to the generated SDK required preserving PayPal's wire response fields and decimal amount strings so payment verification remained reliable. We also kept stable idempotency keys, prevented automatic write retries, and made the SDK visible to Next.js dependency tracing for deployment. The SDK and Context Plugin describe different client surfaces, so checking the installed contracts was essential.

## Accomplishments / testing — update any old counts

The project passes 15 automated tests and a production build. Payment workflow tests use the real installed SDK with mocked HTTP responses. A separate live sandbox check authenticated, created an unapproved checkout and retrieved it successfully; it transferred no funds. These checks do not replace testing buyer approval, capture, refunds and webhooks on the hosted deployment.

## PayPal experience rating and general feedback

Keep your own honest rating. If your feedback says the project uses only direct REST, replace that sentence with: “Crumb now uses the official APIMatic-generated PayPal Server SDK for checkout and refund operations, while webhook signature verification remains on REST.” Do not change a personal experience score solely because the implementation changed.

## Demo video

The current video predates this completed integration. It remains a labelled illustration of the product flow and does not prove a recorded sandbox transaction. An updated technology card or video description may say: “PayPal integration: APIMatic-generated PayPal Server SDK; PayPal Context Plugin consulted during development.” Do not claim the existing video visibly demonstrates plugin installation or a live capture/refund.

## Repository and deployment

The README and APIMATIC_INTEGRATION.md document the integration, setup and validation. On Vercel set PAYPAL_TRANSPORT=apimatic and redeploy the latest commit. Keep the existing sandbox credentials and all other required variables. No new APIMatic secret or paid account is required for this SDK adapter.
