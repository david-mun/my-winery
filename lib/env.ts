import "server-only";
// Dynamic lookup prevents Next's build-time NEXT_PUBLIC substitution in server code.
// The production server and test adapter can use different runtime environments.
export function serverEnv() {
  const read = (name: string): string | undefined =>
    Reflect.get(process.env, name);
  return {
    url: read("NEXT_PUBLIC_SUPABASE_URL"),
    key: read("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    secret: read("SUPABASE_SECRET_KEY"),
    appUrl: read("NEXT_PUBLIC_APP_URL") ?? "http://localhost:3000",
  };
}
