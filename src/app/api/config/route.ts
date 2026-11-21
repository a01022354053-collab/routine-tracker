// 브라우저가 Supabase에 붙을 때 쓰는 공개 설정(anon 키는 공개해도 되는 키, 기록은 RLS가 지킨다)
export function GET() {
  return Response.json({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? null,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? null,
  });
}
