# InField 7

The web app and the API are separate folders. Install and run each one on its own. Deploy them as two services: `frontend` is the Next.js site, `backend` is the Fastify API.

```bash
cd infield7/backend
npm install
npm run dev
```

```bash
cd infield7/frontend
npm install
npm run dev
```

Web: http://localhost:3000  
API: http://localhost:4000  
Database: PostgreSQL on localhost, database `infield7`. The backend reads `DATABASE_URL` from `backend/.env`.

The frontend reads `NEXT_PUBLIC_API_URL` from `frontend/.env.local`. Locally that is `http://localhost:4000`.

The Android app is a third folder, `mobile`. It is the employee phone: sign-in, check-in with a photo, and tasks. It calls the same API.

```bash
cd infield7/mobile
npm install
npx expo start
```

Open it in Expo Go on a phone that is on the same network. `mobile/.env` points at `http://172.20.10.5:4000`. Change `EXPO_PUBLIC_API_URL` if this machine’s address changes. This computer does not have the Android SDK, so the app is not installed as a store build yet.

SMS is stubbed. The verify screen shows the development code. Set `SMS_PROVIDER=msg91` on the backend only after credentials exist.

Check-in needs location consent, a GPS fix sharper than 80 m, and a point inside the site radius. A fix that sits on the fence is refused until it is clearer.

Billing is one plan, Basic: 1,000 credits a month at $8 per 1,000, invoiced in INR at ₹84 per dollar plus 18% GST. A weekly brief costs 12 credits. When the pool is empty, the brief stops. UPI AutoPay is stubbed until `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_PLAN_ID` are set on the backend. Set `INFIELD_GSTIN` before a real supplier invoice.
