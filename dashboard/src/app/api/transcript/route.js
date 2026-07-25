import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const callId = searchParams.get('callId');

  if (!callId) {
    return NextResponse.json({ error: 'Missing callId' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('transcripts')
    .select('transcript')
    .eq('call_id', callId)
    .maybeSingle();

  if (error) {
    console.error('Transcript fetch error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ status: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({ status: 'ready', transcript: data.transcript });
}
