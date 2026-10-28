# ⚡ VistaPanel & cPanel Deployment Guide

This package is configured for instant drag-and-drop deployment to **VistaPanel** (e.g. InfinityFree, ByetHost, ProFreeHost, iFastNet) and standard **cPanel** hosting environments.

No Node.js, terminal, SSH, or root access is needed. The backend runs on standard PHP (7.4 to 8.3+) using a self-contained, zero-dependency JSON database.

---

## 📁 Package Structure

```text
vistapanel_cpanel_deploy/
├── .htaccess                 # Apache rewrite rules for clean URLs & API routing
├── index.html                # Main landing page with Auth modal
├── signup.html               # Standalone centered Sign-Up page (/signup)
├── login.html                # Standalone centered Sign-In page (/login)
├── pay.html                  # Public checkout interface (/pay/:slug)
├── profile.html              # Merchant profile portal (/profile)
├── admin.html                # Owner & Management team console (/admin)
├── terms.html                # Terms and Conditions (/terms)
├── assets/                   # Cash App icons, SVG logos & branding
├── api/
│   ├── index.php             # Master REST API router (Auth, Pay Links, LNURL, Admin)
│   ├── db.php                # Database & authentication engine
│   ├── lnurl.php             # Bitcoin spot rate & LNURL invoice generator
│   └── telegram.php          # Instant Telegram notification service
└── data/
    ├── .htaccess             # Security lock: blocks browser access to database.json
    └── database.json         # Pre-seeded platform database
```

---

## 🚀 How to Deploy on VistaPanel (InfinityFree / ByetHost / ProFreeHost)

1. **Log in to your VistaPanel**:
   - Access your hosting account dashboard and open the **Online File Manager** (MonstaFTP) or connect using FileZilla via FTP.
2. **Navigate to the web root**:
   - Open your domain directory, then enter the `htdocs/` folder (e.g., `/yourdomain.com/htdocs/` or `/htdocs/`).
   - If there is a default `index2.html` or placeholder file, delete it.
3. **Upload the files**:
   - Upload all files and folders from inside `vistapanel_cpanel_deploy/` directly into `htdocs/`.
   - Make sure `.htaccess` (both root and inside `data/`) is uploaded.
4. **Set Folder Permissions**:
   - Ensure the `data/` directory has write permissions so PHP can save transactions and user registrations:
     - In File Manager or FileZilla: Right-click `data/` -> **Permissions / Chmod** -> Set to `755` (or `777` if required by the host).
5. **Done!**
   - Open your domain in your browser: `https://yourdomain.com/`

---

## 🚀 How to Deploy on Standard cPanel (Namecheap, Hostinger, Bluehost, GoDaddy)

1. **Log in to cPanel**:
   - Go to your hosting cPanel and click **File Manager**.
2. **Navigate to `public_html`**:
   - Open the `public_html/` folder (or your subdomain directory).
3. **Upload & Extract**:
   - Zip the contents of `vistapanel_cpanel_deploy/` on your computer.
   - Click **Upload** in cPanel, select the zip file, and once uploaded, click **Extract**.
   - Ensure all files (`index.html`, `admin.html`, `.htaccess`, `api/`, `data/`, etc.) reside directly in `public_html/`.
4. **Verify Hidden Files**:
   - In cPanel File Manager, click **Settings** (top right) and check **"Show Hidden Files (dotfiles)"** to confirm `.htaccess` is present.
5. **Permissions**:
   - Check that `data/` has `755` permission.

---

## 🔐 Admin & Owner Credentials

| Parameter | Value |
| :--- | :--- |
| **Console URL** | `https://yourdomain.com/admin` |
| **Email** | `Deeploveneed@gmail.com` |
| **Password** | `Mostafizur7788##` |
| **Role** | Root Owner (`owner`) |

---

## 🛠️ Key Platform Features Included

1. **Clean URLs (Zero `.html` extensions)**:
   - Payment checkout: `https://yourdomain.com/pay/natasha-torres`
   - Admin console: `https://yourdomain.com/admin`
   - Merchant profile: `https://yourdomain.com/profile`
   - Sign up & Log in: `https://yourdomain.com/signup` & `/login`
2. **2-for-1 Fee Commission Engine**:
   - Users receive 2 payments directly to their wallet.
   - Every 3rd payment automatically routes to the Owner's Satoshi wallet (`system_settings.owner_lightning_address`).
3. **Full Admin Control over Pay Links**:
   - View, create, pause, edit, and delete payment links for any merchant on the platform.
4. **Admin Impersonation**:
   - Click `👁️ Visit Profile` on any user row to view their dashboard in a secure admin session.
5. **Telegram Bot Alerts**:
   - Instant notifications on invoice creation and settlement sent to your Telegram chat.

