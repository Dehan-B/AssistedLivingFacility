console.log("supabaseClient.js loaded ✅");

const SUPABASE_URL = "https://stbswllnvdbtufmbivbt.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN0YnN3bGxudmRidHVmbWJpdmJ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4MTY4MzYsImV4cCI6MjA4NjM5MjgzNn0.rgiYwcpRSDVMN9E6LnS5TJx9g98xzCEm8-k_zRGJsts";

try {
  window.sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false
    }
  });

  console.log("Supabase client ready ✅", window.sb);

  // Quick test (this should ALWAYS resolve quickly)
  window.sb.auth.getSession().then((r) => {
    console.log("Initial getSession ✅", r);
  }).catch((e) => {
    console.error("Initial getSession ❌", e);
  });

} catch (e) {
  console.error("Supabase init crashed ❌", e);
}
