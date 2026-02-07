'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type Language = 'th' | 'en';

interface Translations {
    [key: string]: {
        th: string;
        en: string;
    };
}

const translations: Translations = {
    // Header
    'nav.features': { th: 'คุณสมบัติ', en: 'Features' },
    'nav.dashboard': { th: 'Dashboard', en: 'Dashboard' },
    'nav.login': { th: 'เข้าสู่ระบบ', en: 'Login' },
    'nav.admin': { th: 'ระบบแอดมิน', en: 'Admin System' },

    // Hero
    'hero.status': { th: 'ระบบพร้อมใช้งาน', en: 'System Ready' },
    'hero.title1': { th: 'ระบบจับเวลา', en: 'Timing System' },
    'hero.title2': { th: 'รุ่นใหม่', en: 'New Generation' },
    'hero.subtitle': {
        th: 'เทคโนโลยีจับเวลาความแม่นยำสูงระดับมืออาชีพ พร้อมแสดงผลแบบ Real-time สำหรับงานวิ่งทุกระดับ',
        en: 'Professional high-precision timing technology with Real-time display for all running events'
    },
    'hero.viewEvents': { th: 'ดูกิจกรรมทั้งหมด', en: 'View All Events' },
    'hero.gotoDashboard': { th: 'เข้าสู่ Dashboard →', en: 'Go to Dashboard →' },

    // Events Section
    'events.title': { th: 'กิจกรรมทั้งหมด', en: 'All Events' },
    'events.subtitle': { th: 'คลิกเพื่อดูผลการแข่งขันของแต่ละกิจกรรม', en: 'Click to view results for each event' },
    'events.noEvents': { th: 'ยังไม่มีกิจกรรม', en: 'No events yet' },
    'events.viewResults': { th: 'ดูผลการแข่งขัน →', en: 'View Results →' },
    'events.live': { th: '● LIVE', en: '● LIVE' },
    'events.viewResult': { th: 'ดูผล', en: 'Results' },
    'events.free': { th: 'ฟรี', en: 'Free' },
    'events.details': { th: 'รายละเอียด', en: 'Details' },

    // Activity Card Table Headers
    'card.status': { th: 'สถานะ', en: 'Status' },
    'card.distance': { th: 'ระยะทาง', en: 'Distance' },
    'card.start': { th: 'ปล่อยตัว', en: 'Start' },
    'card.cutoff': { th: 'คัทออฟ', en: 'CUTOFF' },
    'card.cutoffItra': { th: 'คัทออฟ / ITRA / INDEX', en: 'Cutoff / ITRA / INDEX' },
    'card.itra': { th: 'ITRA', en: 'ITRA' },
    'card.index': { th: 'INDEX', en: 'INDEX' },
    'card.typeElev': { th: 'ความสูง', en: 'Elevation' },
    'card.type': { th: 'ประเภท', en: 'Type' },
    'card.elevation': { th: 'ความสูง', en: 'Elevation' },
    'card.days': { th: 'วัน', en: 'D' },
    'card.hours': { th: 'ชม.', en: 'H' },
    'card.mins': { th: 'นาที', en: 'M' },
    'card.secs': { th: 'วิ', en: 'S' },
    'card.viewResults': { th: 'รายละเอียด →', en: 'Details →' },
    'card.category': { th: 'ประเภท', en: 'Category' },

    // Event 1 - DOI INTHANON
    'event1.location': { th: 'อุทยานแห่งชาติดอยอินทนนท์, เชียงใหม่', en: 'Doi Inthanon National Park, Chiang Mai' },
    'event1.date': { th: '6-8 ธันวาคม 2568', en: '6-8 December 2025' },

    // Event 2 - TANAOSRI TRAIL
    'event2.location': { th: 'สวนพฤกษศาสตร์วรรณคดี, ราชบุรี', en: 'Literature Botanical Garden, Ratchaburi' },
    'event2.date': { th: '10-12 ธันวาคม 2568', en: '10-12 December 2025' },

    // Event 3 - BURIRAM MARATHON
    'event3.location': { th: 'สนามช้าง อินเตอร์เนชั่นแนล เซอร์กิต', en: 'Chang International Circuit' },
    'event3.date': { th: '25 มกราคม 2569 (Night Run)', en: '25 January 2026 (Night Run)' },

    // Event 4 - BANGSAEN 21
    'event4.location': { th: 'ชายหาดบางแสน, ชลบุรี', en: 'Bangsaen Beach, Chonburi' },
    'event4.date': { th: '16 ธันวาคม 2568', en: '16 December 2025' },

    // Features Section
    'features.title': { th: 'ทำไมต้องเลือกเรา', en: 'Why Choose Us' },
    'features.subtitle': { th: 'เทคโนโลยีที่ดีที่สุดสำหรับงานวิ่งของคุณ', en: 'The best technology for your running events' },
    'features.speed.title': { th: 'ความเร็วสูง', en: 'High Speed' },
    'features.speed.desc': { th: 'จับเวลาแม่นยำถึง 0.01 วินาที', en: 'Accurate up to 0.01 seconds' },
    'features.rfid.title': { th: 'RFID Technology', en: 'RFID Technology' },
    'features.rfid.desc': { th: 'เทคโนโลยี RFID ระดับสากล', en: 'International RFID technology' },
    'features.realtime.title': { th: 'Real-time', en: 'Real-time' },
    'features.realtime.desc': { th: 'ดูผลลัพธ์แบบเรียลไทม์', en: 'View results in real-time' },
    'features.easy.title': { th: 'ใช้งานง่าย', en: 'Easy to Use' },
    'features.easy.desc': { th: 'รองรับทุกอุปกรณ์', en: 'Works on all devices' },
    'features.ranking.title': { th: 'Auto Ranking', en: 'Auto Ranking' },
    'features.ranking.desc': { th: 'คำนวณอันดับอัตโนมัติ', en: 'Automatic ranking calculation' },
    'features.secure.title': { th: 'ปลอดภัย', en: 'Secure' },
    'features.secure.desc': { th: 'ข้อมูลเข้ารหัสทุกขั้นตอน', en: 'Data encrypted at every step' },

    // Results Page
    'results.loading': { th: 'กำลังโหลดผล...', en: 'Loading results...' },
    'results.error': { th: 'เกิดข้อผิดพลาด', en: 'Error' },
    'results.back': { th: '← กลับ', en: '← Back' },
    'results.search': { th: 'ค้นหา BIB หรือชื่อ...', en: 'Search BIB or Name...' },

    // Common
    'common.date': { th: 'วันที่จัด', en: 'Date' },
    'common.location': { th: 'สถานที่จัด', en: 'Location' },

    // Admin
    'admin.events': { th: 'อีเวนท์', en: 'Events' },
    'admin.allEvents': { th: 'กิจกรรมทั้งหมด', en: 'All Events' },
    'admin.addEvent': { th: 'เพิ่มกิจกรรม', en: 'Add Event' },
    'admin.editEvent': { th: 'แก้ไขกิจกรรม', en: 'Edit Event' },
    'admin.deleteEvent': { th: 'ลบกิจกรรม', en: 'Delete Event' },
    'admin.confirmDelete': { th: 'ยืนยันการลบ', en: 'Confirm Delete' },
    'admin.deleteWarning': { th: 'การดำเนินการนี้ไม่สามารถย้อนกลับได้', en: 'This action cannot be undone' },
    'admin.cancel': { th: 'ยกเลิก', en: 'Cancel' },
    'admin.save': { th: 'บันทึก', en: 'Save' },
    'admin.saving': { th: 'กำลังบันทึก...', en: 'Saving...' },
    'admin.deleting': { th: 'กำลังลบ...', en: 'Deleting...' },
    'admin.createEvent': { th: 'สร้างกิจกรรมใหม่', en: 'Create New Event' },
    'admin.eventName': { th: 'ชื่อกิจกรรม', en: 'Event Name' },
    'admin.startDate': { th: 'วันที่เริ่มกิจกรรม', en: 'Start Date' },
    'admin.endDate': { th: 'วันที่สิ้นสุด', en: 'End Date' },
    'admin.status': { th: 'สถานะ', en: 'Status' },
    'admin.upcoming': { th: 'กำลังจะมา', en: 'Upcoming' },
    'admin.live': { th: 'กำลังดำเนินการ', en: 'Live' },
    'admin.finished': { th: 'จบแล้ว', en: 'Finished' },
    'admin.raceCategories': { th: 'ประเภทการแข่งขัน', en: 'Race Categories' },
    'admin.addCategory': { th: 'เพิ่มประเภท', en: 'Add Category' },
    'admin.rfidSync': { th: 'ซิงค์ RFID', en: 'RFID Sync' },
    'admin.draft': { th: 'แบบร่าง', en: 'Draft' },
    'admin.bannerImage': { th: 'ภาพหน้าปกกิจกรรม', en: 'Event Banner Image' },
    'admin.uploadImage': { th: 'อัปโหลดรูป', en: 'Upload Image' },

    // Dashboard
    'dashboard.title': { th: 'ผลการแข่งขัน', en: 'Race Results' },
    'dashboard.participants': { th: 'ผู้เข้าแข่งขัน', en: 'Participants' },
    'dashboard.finished': { th: 'จบแล้ว', en: 'Finished' },
    'dashboard.running': { th: 'กำลังวิ่ง', en: 'Running' },
    'dashboard.rank': { th: 'อันดับ', en: 'Rank' },
    'dashboard.bib': { th: 'BIB', en: 'BIB' },
    'dashboard.fullName': { th: 'ชื่อ-นามสกุล', en: 'Full Name' },
    'dashboard.nationality': { th: 'สัญชาติ', en: 'Nationality' },
    'dashboard.gender': { th: 'เพศ', en: 'Gender' },
    'dashboard.ageGroup': { th: 'กลุ่มอายุ', en: 'Age Group' },
    'dashboard.elapsedTime': { th: 'เวลา', en: 'Elapsed Time' },
    'dashboard.details': { th: 'รายละเอียด', en: 'Details' },
    'dashboard.view': { th: 'ดู', en: 'View' },
    'dashboard.noParticipants': { th: 'ไม่พบข้อมูลผู้เข้าแข่งขัน', en: 'No participants found' },
    'dashboard.backHome': { th: 'กลับหน้าแรก', en: 'Back to Home' },
    'dashboard.notFound': { th: 'ไม่พบข้อมูล', en: 'Not Found' },
    'dashboard.loading': { th: 'กำลังโหลดข้อมูล...', en: 'Loading...' },
    'dashboard.runnerDetails': { th: 'รายละเอียดนักวิ่ง', en: 'Runner Details' },
    'dashboard.name': { th: 'ชื่อ', en: 'Name' },
    'dashboard.category': { th: 'ประเภท', en: 'Category' },
    'dashboard.overallRank': { th: 'อันดับรวม', en: 'Overall Rank' },
    'dashboard.genderRank': { th: 'อันดับเพศ', en: 'Gender Rank' },
    'dashboard.netTime': { th: 'เวลาสุทธิ', en: 'Net Time' },
    'dashboard.team': { th: 'ทีม', en: 'Team' },
    'dashboard.male': { th: 'ชาย', en: 'Male' },
    'dashboard.female': { th: 'หญิง', en: 'Female' },
    'dashboard.all': { th: 'ทั้งหมด', en: 'All' },
    'dashboard.searchPlaceholder': { th: 'ค้นหา BIB หรือชื่อ...', en: 'Search BIB or Name...' },

    // Footer
    'footer.privacy': { th: 'ความเป็นส่วนตัว', en: 'Privacy' },
    'footer.terms': { th: 'ข้อกำหนด', en: 'Terms' },
    'footer.contact': { th: 'ติดต่อ', en: 'Contact' },
};

interface LanguageContextType {
    language: Language;
    setLanguage: (lang: Language) => void;
    t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
    const [language, setLanguage] = useState<Language>('th');

    useEffect(() => {
        const saved = localStorage.getItem('language') as Language;
        if (saved && (saved === 'th' || saved === 'en')) {
            setLanguage(saved);
        }
    }, []);

    const handleSetLanguage = (lang: Language) => {
        setLanguage(lang);
        localStorage.setItem('language', lang);
    };

    const t = (key: string): string => {
        const translation = translations[key];
        if (!translation) return key;
        return translation[language] || key;
    };

    return (
        <LanguageContext.Provider value={{ language, setLanguage: handleSetLanguage, t }}>
            {children}
        </LanguageContext.Provider>
    );
}

export function useLanguage() {
    const context = useContext(LanguageContext);
    if (!context) {
        throw new Error('useLanguage must be used within a LanguageProvider');
    }
    return context;
}
