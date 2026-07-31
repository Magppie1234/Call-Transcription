import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// FAQ analysis built by scripts/extract_faqs.py + scripts/aggregate_faqs.py.
// The whole analysis lives as one jsonb value in app_kv (key 'faq_analysis')
// rather than its own tables — see aggregate_faqs.py for why.
export async function GET() {
  try {
    const { data, error } = await supabase
      .from('app_kv').select('value,updated_at').eq('key', 'faq_analysis').maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) {
      return NextResponse.json(
        { error: 'No FAQ analysis published yet — run scripts/aggregate_faqs.py' },
        { status: 404 });
    }
    return NextResponse.json({ ...data.value, published_at: data.updated_at });
  } catch (err) {
    console.error('FAQs API error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
