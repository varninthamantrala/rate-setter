import { createApp } from './app';
import { openDb } from './db';

const secret = process.env.JWT_SECRET;
if (!secret && process.env.NODE_ENV === 'production') throw new Error('JWT_SECRET must be set in production');
const app = createApp({ db: openDb(), jwtSecret: secret ?? 'dev-only-secret-change-me' });
const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => console.log(`Rate Setter API on http://localhost:${port}`));
