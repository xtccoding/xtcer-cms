export async function GET({ locals }: { locals: any }) {
  const runtime = locals?.runtime?.env
  return new Response(JSON.stringify({
    hasRuntime: !!locals?.runtime,
    hasEnv: !!runtime,
    hasAdminPassword: !!runtime?.ADMIN_PASSWORD,
    hasFeedKey: !!runtime?.FEED_API_KEY,
    hasSupabaseUrl: !!runtime?.PUBLIC_SUPABASE_URL,
  }), { headers: { 'Content-Type': 'application/json' } })
}
