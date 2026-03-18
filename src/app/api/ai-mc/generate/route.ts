'use server';

import { NextResponse } from 'next/server';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyBnq2fRNg5MIyjZhW48IywmrvK9UoLfMM8';
const GEMINI_MODEL = 'gemini-2.5-flash';

const MC_STYLES = {
    fun: 'คุณเป็น MC สนุกสนาน พูดเชียร์แบบคึกคัก สนุก ตื่นเต้น ใช้คำพูดเร้าใจและให้กำลังใจ อาจใส่คำอุทานหรือเสียงเชียร์',
    formal: 'คุณเป็นพิธีกรทางการ พูดสุภาพ ให้เกียรตินักกีฬา ใช้คำพูดอบอุ่นและเป็นกันเอง',
    sport: 'คุณเป็นผู้บรรยายกีฬามืออาชีพ พูดเร็ว ตื่นเต้น ใช้ศัพท์กีฬา เหมือนบรรยายสดๆ',
    regional_isan: 'คุณเป็น MC สำเนียงอีสาน พูดเชียร์แบบม่วนซื่น ใช้คำอีสานปนไทยกลาง เช่น สู้ให้เบิดแฮง มาแล้วเด้อ',
    regional_south: 'คุณเป็น MC สำเนียงปักษ์ใต้ พูดเชียร์แบบคนใต้ ใช้คำใต้ปนไทยกลาง เช่น หลาดๆ สู้ตายเลย',
    regional_north: 'คุณเป็น MC สำเนียงเหนือ พูดเชียร์แบบคนเมือง ใช้คำเหนือน่ารัก เช่น สู้ตี้เจ้า แม่นแล้ว เก่งขนาดเจ้า',
};

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const {
            runnerName, runnerNameTh, bib, category, gender, nationality,
            ageGroup, team, style = 'fun',
        } = body;

        const stylePrompt = MC_STYLES[style as keyof typeof MC_STYLES] || MC_STYLES.fun;

        const displayName = runnerNameTh || runnerName || `BIB ${bib}`;
        const genderTh = gender === 'F' ? 'หญิง' : gender === 'M' ? 'ชาย' : '';

        const systemPrompt = `${stylePrompt}

กฎสำคัญ:
- พูดเป็นภาษาไทยเท่านั้น
- สั้นกระชับ 1-10 ประโยค ไม่เกิน 80 คำ
- ห้ามซ้ำกับครั้งก่อน ต้องสร้างสรรค์ใหม่ทุกครั้ง
- ใช้ชื่อนักกีฬาในข้อความ
- พูดตอนนักกีฬากำลังจะเข้าเส้นชัย ให้เชียร์ให้กำลังใจ
- ห้ามใส่คำอธิบาย ห้ามใส่ emoji ห้ามใส่ markdown
- ตอบเป็นข้อความเสียงพิธีกรพูดตรงๆ เท่านั้น`;

        const userPrompt = `ช่วยสร้างคำพูดเชียร์นักกีฬาคนนี้:
ชื่อ: ${displayName}
BIB: ${bib || '-'}
ระยะ: ${category || '-'}
เพศ: ${genderTh || '-'}
กลุ่มอายุ: ${ageGroup || '-'}
ทีม: ${team || '-'}
สัญชาติ: ${nationality || 'ไทย'}

สร้างคำพูด MC เชียร์สั้นๆ 2-3 ประโยค ที่สนุกและไม่ซ้ำใคร`;

        const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: userPrompt }] }],
                    systemInstruction: { parts: [{ text: systemPrompt }] },
                    generationConfig: {
                        temperature: 1.2,
                        topP: 0.95,
                        topK: 40,
                        maxOutputTokens: 200,
                    },
                }),
            }
        );

        if (!res.ok) {
            const errText = await res.text();
            console.error('[AI MC] Gemini API error:', res.status, errText);
            return NextResponse.json({ error: `Gemini API error: ${res.status}` }, { status: 500 });
        }

        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';

        if (!text) {
            return NextResponse.json({ error: 'Empty response from Gemini' }, { status: 500 });
        }

        return NextResponse.json({ text, style });
    } catch (err: any) {
        console.error('[AI MC] Error:', err);
        return NextResponse.json({ error: err?.message || 'Unknown error' }, { status: 500 });
    }
}
