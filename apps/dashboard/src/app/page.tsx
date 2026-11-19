import { redirect } from 'next/navigation';

/** Entry point: /app sends signed-out visitors to /login (via the proxy guard). */
export default function HomePage() {
  redirect('/app');
}
