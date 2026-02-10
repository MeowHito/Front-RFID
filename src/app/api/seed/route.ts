import { NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://3.26.160.149:3001';

// Sample Thai runner names for testing
const SAMPLE_RUNNERS = [
    { firstName: 'สมชาย', lastName: 'วิ่งเร็ว', firstNameTh: 'สมชาย', lastNameTh: 'วิ่งเร็ว', gender: 'M', age: 28, ageGroup: '25-29' },
    { firstName: 'สมหญิง', lastName: 'แข็งแรง', firstNameTh: 'สมหญิง', lastNameTh: 'แข็งแรง', gender: 'F', age: 25, ageGroup: '25-29' },
    { firstName: 'วิชัย', lastName: 'ใจสู้', firstNameTh: 'วิชัย', lastNameTh: 'ใจสู้', gender: 'M', age: 35, ageGroup: '35-39' },
    { firstName: 'นภา', lastName: 'ท้าลม', firstNameTh: 'นภา', lastNameTh: 'ท้าลม', gender: 'F', age: 32, ageGroup: '30-34' },
    { firstName: 'ธนวัฒน์', lastName: 'มุ่งมั่น', firstNameTh: 'ธนวัฒน์', lastNameTh: 'มุ่งมั่น', gender: 'M', age: 40, ageGroup: '40-44' },
    { firstName: 'พิมพ์ใจ', lastName: 'ไม่ท้อ', firstNameTh: 'พิมพ์ใจ', lastNameTh: 'ไม่ท้อ', gender: 'F', age: 29, ageGroup: '25-29' },
    { firstName: 'อนุชา', lastName: 'สายลม', firstNameTh: 'อนุชา', lastNameTh: 'สายลม', gender: 'M', age: 45, ageGroup: '45-49' },
    { firstName: 'กมลวรรณ', lastName: 'เก่งกาจ', firstNameTh: 'กมลวรรณ', lastNameTh: 'เก่งกาจ', gender: 'F', age: 27, ageGroup: '25-29' },
    { firstName: 'ประยุทธ์', lastName: 'ฝ่าฟัน', firstNameTh: 'ประยุทธ์', lastNameTh: 'ฝ่าฟัน', gender: 'M', age: 50, ageGroup: '50-54' },
    { firstName: 'ศิริพร', lastName: 'ก้าวหน้า', firstNameTh: 'ศิริพร', lastNameTh: 'ก้าวหน้า', gender: 'F', age: 33, ageGroup: '30-34' },
    { firstName: 'John', lastName: 'Smith', gender: 'M', age: 30, ageGroup: '30-34', nationality: 'American' },
    { firstName: 'Emma', lastName: 'Johnson', gender: 'F', age: 26, ageGroup: '25-29', nationality: 'British' },
    { firstName: 'ปรีชา', lastName: 'นักสู้', firstNameTh: 'ปรีชา', lastNameTh: 'นักสู้', gender: 'M', age: 38, ageGroup: '35-39' },
    { firstName: 'อรทัย', lastName: 'สดใส', firstNameTh: 'อรทัย', lastNameTh: 'สดใส', gender: 'F', age: 24, ageGroup: '20-24' },
    { firstName: 'กิตติ', lastName: 'ไม่ยอมแพ้', firstNameTh: 'กิตติ', lastNameTh: 'ไม่ยอมแพ้', gender: 'M', age: 42, ageGroup: '40-44' },
];

export async function POST() {
    try {
        // 0. Login to get auth token
        const loginRes = await fetch(`${BACKEND_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'admin@rfidtiming.com', password: 'admin123' }),
        });
        if (!loginRes.ok) {
            return NextResponse.json({ error: 'Failed to login' }, { status: 500 });
        }
        const loginData = await loginRes.json();
        const authToken = loginData.access_token;
        const authHeaders = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`,
        };

        // 1. Find campaigns
        const campaignsRes = await fetch(`${BACKEND_URL}/campaigns`, { cache: 'no-store' });
        if (!campaignsRes.ok) {
            return NextResponse.json({ error: 'Failed to fetch campaigns' }, { status: 500 });
        }
        const campaignsData = await campaignsRes.json();
        const campaigns = campaignsData?.data || campaignsData || [];

        // Find "Core X 250" campaign
        const targetCampaign = campaigns.find((c: { name?: string }) =>
            c.name?.toLowerCase().includes('core') ||
            c.name?.toLowerCase().includes('ultra') ||
            c.name?.toLowerCase().includes('250')
        );

        if (!targetCampaign) {
            return NextResponse.json({
                error: 'Campaign "Core X 250 Ultra Trail 2025" not found',
                availableCampaigns: campaigns.map((c: { _id: string; name: string }) => ({ _id: c._id, name: c.name })),
            }, { status: 404 });
        }

        // 2. Find or create events for this campaign
        const eventsRes = await fetch(`${BACKEND_URL}/events/by-campaign/${targetCampaign._id}`, { cache: 'no-store' });
        let events: { _id: string; category?: string; name?: string }[] = [];
        if (eventsRes.ok) {
            const eventsData = await eventsRes.json();
            events = Array.isArray(eventsData) ? eventsData : [];
        }

        // If no events, create one for 155KM category
        if (events.length === 0) {
            const newEvent = {
                campaignId: targetCampaign._id,
                name: 'CORE X250 Ultra Trail - 155KM',
                category: '155KM',
                distance: 155,
                date: '2026-04-30T06:00:00.000Z',
                location: targetCampaign.location || 'Chiangmai Thailand',
                status: 'upcoming',
                categories: ['155KM'],
            };

            const createEventRes = await fetch(`${BACKEND_URL}/events`, {
                method: 'POST',
                headers: authHeaders,
                body: JSON.stringify(newEvent),
            });

            if (!createEventRes.ok) {
                const errText = await createEventRes.text();
                return NextResponse.json({
                    error: 'Failed to create event for the campaign',
                    details: errText,
                }, { status: 500 });
            }

            const createdEvent = await createEventRes.json();
            events = [createdEvent];
        }

        const eventId = events[0]._id;
        const categoryName = events[0].category || events[0].name || '155KM';

        // 3. Check if runners already exist for this event
        const existingRes = await fetch(`${BACKEND_URL}/runners?id=${eventId}`, { cache: 'no-store' });
        let existingRunners: { bib: string }[] = [];
        if (existingRes.ok) {
            const existingData = await existingRes.json();
            existingRunners = Array.isArray(existingData) ? existingData : [];
        }

        const existingBibs = new Set(existingRunners.map((r) => r.bib));

        // 4. Create runners (skip duplicates)
        const newRunners = SAMPLE_RUNNERS
            .map((runner, idx) => ({
                eventId,
                bib: String(1001 + idx),
                firstName: runner.firstName,
                lastName: runner.lastName,
                firstNameTh: runner.firstNameTh || '',
                lastNameTh: runner.lastNameTh || '',
                gender: runner.gender,
                age: runner.age,
                ageGroup: runner.ageGroup,
                category: categoryName,
                nationality: (runner as any).nationality || 'Thai',
                status: 'not_started',
                allowRFIDSync: true,
            }))
            .filter((r) => !existingBibs.has(r.bib));

        if (newRunners.length === 0) {
            return NextResponse.json({
                success: true,
                message: 'Runners already exist for this event. No new runners added.',
                campaign: targetCampaign.name,
                existingCount: existingRunners.length,
            });
        }

        const createRes = await fetch(`${BACKEND_URL}/runners/bulk`, {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify(newRunners),
        });

        if (!createRes.ok) {
            const errText = await createRes.text();
            return NextResponse.json({
                error: 'Failed to create runners',
                details: errText,
            }, { status: createRes.status });
        }

        const created = await createRes.json();

        return NextResponse.json({
            success: true,
            message: `Created ${newRunners.length} test runners for "${targetCampaign.name}"`,
            campaign: targetCampaign.name,
            eventName: events[0].name || events[0].category,
            runnersCreated: Array.isArray(created) ? created.length : newRunners.length,
        });
    } catch (error) {
        console.error('Seed error:', error);
        return NextResponse.json({ error: 'Internal server error', details: String(error) }, { status: 500 });
    }
}
