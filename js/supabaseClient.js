console.log("supabaseClient.js loaded ✅");

const SUPABASE_URL = "https://stbswllnvdbtufmbivbt.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN0YnN3bGxudmRidHVmbWJpdmJ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4MTY4MzYsImV4cCI6MjA4NjM5MjgzNn0.rgiYwcpRSDVMN9E6LnS5TJx9g98xzCEm8-k_zRGJsts";

try {
  // ✅ Public client (NO persistence, NO refresh-token calls)
  window.sbPublic = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  // ✅ Admin client (PERSIST session + AUTO refresh)
  window.sbAdmin = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  // Decide which one should be used as window.sb
  const path = (location.pathname || "").toLowerCase();
  const isAdminPage =
    path.endsWith("/admin.html") ||
    path.endsWith("admin.html") ||
    document.getElementById("loginView") ||
    document.getElementById("adminView");

  window.sb = isAdminPage ? window.sbAdmin : window.sbPublic;

  console.log("Supabase clients ready ✅", {
    using: isAdminPage ? "sbAdmin (persist)" : "sbPublic (no persist)",
  });
} catch (e) {
  console.error("Supabase init crashed ❌", e);
}
