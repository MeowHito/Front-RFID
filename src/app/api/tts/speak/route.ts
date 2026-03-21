import { NextResponse } from 'next/server';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyBnq2fRNg5MIyjZhW48IywmrvK9UoLfMM8';
const GEMINI_TTS_MODEL = 'gemini-2.5-flash-preview-tts';

const GEMINI_VOICES = [
    { name: 'Zephyr', label: 'Zephyr — Bright', lang: 'th' },
    { name: 'Puck', label: 'Puck — Upbeat', lang: 'th' },
    { name: 'Charon', label: 'Charon — Informative', lang: 'th' },
    { name: 'Kore', label: 'Kore — Firm', lang: 'th' },
    { name: 'Fenrir', label: 'Fenrir — Excitable', lang: 'th' },
    { name: 'Aoede', label: 'Aoede — Breezy', lang: 'th' },
    { name: 'Leda', label: 'Leda — Youthful', lang: 'th' },
    { name: 'Orus', label: 'Orus — Firm (Deep)', lang: 'th' },
    { name: 'Pegasus', label: 'Pegasus — Warm', lang: 'th' },
];

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { text, voice = 'Kore' } = body;

        if (!text || typeof text !== 'string') {
            return NextResponse.json({ error: 'Missing text' }, { status: 400 });
        }

        const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TTS_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text }] }],
                    generationConfig: {
                        responseModalities: ['AUDIO'],
                        speechConfig: {
                            voiceConfig: {
                                prebuiltVoiceConfig: {
                                    voiceName: voice,
                                },
                            },
                        },
                    },
                }),
            }
        );

        if (!res.ok) {
            const errText = await res.text();
            console.error('[TTS] Gemini API error:', res.status, errText);
            return NextResponse.json({ error: `Gemini TTS error: ${res.status}` }, { status: 500 });
        }

        const data = await res.json();
        const audioPart = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData;

        if (!audioPart?.data) {
            console.error('[TTS] No audio data in response:', JSON.stringify(data).slice(0, 500));
            return NextResponse.json({ error: 'No audio in response' }, { status: 500 });
        }

        // Return base64 audio data
        return NextResponse.json({
            audio: audioPart.data,
            mimeType: audioPart.mimeType || 'audio/mp3',
        });
    } catch (err: any) {
        console.error('[TTS] Error:', err);
        return NextResponse.json({ error: err?.message || 'Unknown error' }, { status: 500 });
    }
}

// GET endpoint to return available voices
export async function GET() {
    return NextResponse.json({ voices: GEMINI_VOICES });
}
