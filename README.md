# Poseidon

Dark, realtime community workspace built with Next.js, Firebase Auth, Firebase Realtime Database and WebRTC signaling.

## Local setup

1. Copy `.env.local.example` to `.env.local`.
2. Create/select your Firebase project and enable **Authentication → Email/Password**.
3. Create a Realtime Database and paste the Firebase Web App config into `.env.local`.
4. Sign in to the Firebase CLI:

```bash
firebase login
firebase use --add
firebase deploy --only database
```

5. Run the app:

```bash
npm run dev
```

The Cerebras key is intentionally not part of the browser app. Cerebras uses the `https://api.cerebras.ai/v1/chat/completions` endpoint and bearer authentication. If AI Twin is enabled, configure it as a Firebase Functions secret:

```bash
firebase functions:secrets:set CEREBRAS_API_KEY
firebase deploy --only functions
```

The Firebase project, account login, database URL and provider keys remain under the project owner's control.

## Spark plan: local Cerebras AI Twin worker

Cloud Functions requires Blaze. To keep the project on Spark, use the local worker:

1. Firebase Console → Project settings → Service accounts → Generate new private key.
2. Store the downloaded JSON outside the public web folder.
3. Copy `worker/.env.example` to `worker/.env.local` and set the service-account path and Cerebras key.
4. Install and run:

```bash
npm install --prefix worker
npm run twin:worker
```

The worker keeps the Cerebras key off the browser. It must remain running for AI Twin replies to be generated.
