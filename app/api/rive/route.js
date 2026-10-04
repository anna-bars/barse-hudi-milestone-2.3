import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET() {
  try {
    const { data, error } = await supabase.storage
      .from('rive-assets')
      .download('hudi.riv');

    if (error || !data) {
      console.error(error);

      return NextResponse.json(
        { error: 'Rive file not found' },
        { status: 404 }
      );
    }

    const buffer = await data.arrayBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: 'Failed to load Rive file' },
      { status: 500 }
    );
  }
}