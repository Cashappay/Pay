# ⚡ Cash App Crypto Lightning Payment Gateway

An enterprise-grade, high-converting payment gateway that accepts **Bitcoin Lightning payments exclusively via Cash App**.

---

## 🏛️ System Architecture & Access URLs

All URLs are clean and pretty (no `.html` files exposed):
* **Portal & Landing Page**: `http://localhost:3000/` (or your live domain)
* **Website Owner & Management Team Console**: `http://localhost:3000/admin` (or `/owner`)
* **Merchant / User Profile**: `http://localhost:3000/profile`
* **Terms and Conditions**: `http://localhost:3000/terms`
* **Public Payment Page**: `http://localhost:3000/pay/:slug` (e.g. `/pay/natasha-torres`)

---

## 👑 Website Owner & Management Console (`/admin`)

Access restricted to users with `owner`, `admin`, or `support` roles.

### Key Capabilities:
1. **Advanced User Monitoring**:
   * Inspect all registered merchants, their Satoshi wallet addresses, and payments count.
   * **Account Freeze / Unfreeze**: Suspends the user from receiving customer payments immediately.
   * **Block / Unblock**: Deactivates login privileges.
   * **Delete Account**: Removes merchant and associated payment pages.
2. **Visitor & Country Tracker**:
   * Real-time audit log of every visitor, click, IP address, country code, browser/device, and destination page slug.
3. **Automated 2-for-1 Platform Fee Engine**:
   * **Rule**: Regular merchants receive **2 payments** directly to their Satoshi wallet. Every **3rd payment** is automatically routed directly to the **Owner Master Satoshi Wallet**.
   * Completely automated and continuous (e.g., payments 1, 2 $\rightarrow$ User; payment 3 $\rightarrow$ Owner; payments 4, 5 $\rightarrow$ User; payment 6 $\rightarrow$ Owner).
   * **Discreet**: Never shown to the user in their profile.
4. **Global Transactions Ledger**:
   * Inspect all transactions across the entire platform.
   * Visual badge indicating routing: `👤 Merchant Wallet` vs `👑 Owner Wallet (3rd Payment Commission)`.
5. **Owner Settings**:
   * Update Master Satoshi Wallet Address.
   * Configure Telegram Bot Token & Chat ID for instant alerts.

> **Default Owner Login Credentials**:
> * **Email**: `Deeploveneed@gmail.com`
> * **Password**: `Mostafizur7788##`

---

## 👤 User Profile (`/profile`)

* Dedicated, clean merchant portal.
* **Capabilities**:
  * View & update default Satoshi (Lightning) wallet address.
  * Create New Payment Pages (with custom title, slug, receiver name, and choice of custom keypad or fixed price).
  * Delete payment pages.
  * Direct payment link sharing and previewing.
* **Streamlined**: Webhook configurations and fee structure are removed from user profile.

> **Default Regular Merchant Login Credentials**:
> * **Email**: `demo@cashapp-gateway.com`
> * **Password**: `user123`

---

## 📜 Terms and Conditions (`/terms`)

* **Mandatory Agreement on Signup**: Every new user must explicitly check *"I agree to the Terms and Conditions"* to register.
* **Discreet Placement**: Terms & Conditions link is positioned cleanly as a button at the very bottom of the website.

---

## 🔔 Telegram Invoice Notifications

* Instant notifications dispatched directly via backend whenever a customer generates an invoice on any payment page.
* Bot tokens and chat IDs are kept 100% server-side and hidden from frontend source code.
