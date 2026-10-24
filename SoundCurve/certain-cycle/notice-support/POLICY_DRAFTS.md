# Policy drafts — email sign-up + donations (DRAFT FOR REVIEW)

**Read this first.** These are drafts so you are not starting from a blank page. They are NOT legal advice and
I am not a lawyer. Fill every [BRACKET], then have a lawyer or a qualified person check them before launch —
especially because you are in India, the site is open to ages 5+, and you will collect emails.
Do not let the agent paste anything into the live Privacy/Terms pages until you have filled the brackets and said "approved".

---
## 1. PRIVACY POLICY — what must change

Your current policy says (a) "zero-data application", (b) "no email address stored anywhere", (c) "no servers
processing your equations", (d) localStorage holds "exactly two preferences", (e) one external service (Google Fonts).
After the email sign-up and donations exist, (a), (b) and (d) become false, and (e) changes. Fix each:

| Where | Old claim | New wording |
|---|---|---|
| 01 Philosophy | "zero-data application … we eliminated [data collection] entirely" | "MathSonify collects almost nothing. Your equations, sounds and graphs stay on your device. The only information we ever receive is an email address you choose to give us on a 'coming soon' page (see 'Email notifications')." |
| 02 What we do not collect | "No accounts… no email address stored anywhere" | Keep "No accounts or passwords" and change the email line to: "**Email addresses only if you ask us to notify you.** See 'Email notifications'. We never ask for your name, phone number or location." |
| 03 Local storage | "exactly two preferences" | List EVERY key actually in the code: `mathsonify-theme`, `mathsonify-lang`, [daily-challenge keys, if shipped], [sound toggle key, if shipped]. Must match the code. |
| 04 Third parties | one service (fonts) | "[If fonts are self-hosted: none for fonts.] Our hosting provider ([Vercel]). Our email-list provider ([PROVIDER NAME]) — only if you sign up for notifications. A donation platform ([PLATFORM]) — only if you choose to donate." |
| 05 Children | "safe and private for users of all ages" | "MathSonify is made to be appropriate for ages 5 and up. If you are under 18, please ask a parent or guardian before giving us an email address, or ask them to enter theirs." |
| Header | Version 1.0 | Version 1.1 and today's date |

### New section: "Email notifications"
> If you enter your email address on a "coming soon" or "maintenance" page, we use it for one purpose: to tell you when that page is ready.
>
> **What we keep:** your email address, which page you asked about (for example SoundLab), the date you signed up, and whether you confirmed.
>
> **Confirmation first:** we send you an email to confirm it is really you. Until you confirm, we do not send you anything else. Every email we send has a one-click unsubscribe link.
>
> **What we do not do:** we do not sell or rent your address, and we do not use it to promote other products without asking you first.
>
> **Who handles it:** your address is stored by [EMAIL PROVIDER NAME] on our behalf, and the sign-up request passes through our hosting provider ([HOSTING PROVIDER]). Neither may use your address for its own marketing. [Their hosted confirmation page may set cookies; see their policy.]
>
> **How long:** we keep your address until the page you asked about has launched and we have sent you the launch email, plus [30] days — or until you unsubscribe or ask us to delete it, whichever comes first.
>
> **Your choices:** to see, correct or delete your data, write to [privacy@mathsonify.com] and we will reply within [30] days. [Name/contact of the person responsible for privacy requests: ______.]
>
> **Under 18:** please ask a parent or guardian to enter their email address instead of yours.

### New section: "Support and donations"
> MathSonify is free. If you choose to support it, the Support page sends you to [DONATION PLATFORM], a separate service run by someone else. When you donate, [PLATFORM] collects your payment details and any name or message you choose to share. **We never see your card or bank details.** [PLATFORM] tells us [your name, the amount and your message, if you provide them] so we can thank you and keep our accounts. What [PLATFORM] collects is covered by its own privacy policy.
>
> If you pay by UPI, the payment is handled by your bank or UPI app; we only see what they report to us (for example the amount and the sender's UPI ID).
>
> Donations are voluntary gifts. They do not unlock features and are not purchases.

---
## 2. TERMS OF USE — what must change

| Where | Change |
|---|---|
| 02 What MathSonify is | The claim "no server-side processing is involved" needs a qualifier: "Graphs and sounds are generated on your device. The only server-side feature is the optional email notification sign-up." |
| New clause "Email notifications" | "By entering your email on a notification page you ask us to send you the message described there. You can unsubscribe at any time using the link in any email." |
| New clause "Support and donations" | "Support is voluntary. It does not give you any feature, service or priority, and is not a purchase of goods or services. [Refund wording — ask a lawyer: donations are generally not refundable, except where the law or the donation platform's rules say otherwise.]" |
| New clause "Governing law" | "These terms are governed by the laws of [JURISDICTION]." (you decide) |
| 03 License to use | Add one line: "You may link to MathSonify and share the images and videos you create with it." (if you want that) |

---
## 3. Also change in the same release
- Footer tagline "zero backend · 100% Web Audio API" -> e.g. "your equations stay on your device".
- About page "Privacy and open access" card: remove "never transmitted to … servers" unless qualified as above.
- The sign-up form itself must show a short version of the promise + the under-18 line (already in the preview).
- Support page small print: "voluntary, third-party site, we never see your card" (already in the preview).

## 4. NOT drafted (needed before Premium or any paid feature)
Refunds and cancellation, automatic renewal disclosures, invoices and tax (GST / international VAT — a merchant-of-record
service can handle this), the payment processor's terms, and consumer-protection wording. Premium is parked, so none of
this is needed for launch — but do not turn on a checkout without it.

## 5. Your fill-in list
[ ] email provider name  [ ] hosting provider (Vercel?)  [ ] donation platform name  [ ] privacy contact email
[ ] who answers privacy requests  [ ] retention period (draft says 30 days)  [ ] governing-law jurisdiction
[ ] refund wording for donations (lawyer)  [ ] confirm the under-18 wording with a lawyer
