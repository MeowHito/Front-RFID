'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useTheme } from '@/lib/theme-context';
import { useLanguage } from '@/lib/language-context';
import { useAuth } from '@/lib/auth-context';
import CursorSpotlight from '@/components/CursorSpotlight';
import ActivityCard from '@/components/ActivityCard';
import ProfileDropdown from '@/components/ProfileDropdown';

// Race category from backend
interface RaceCategory {
  name: string;
  distance: string;
  startTime: string;
  cutoff: string;
  elevation?: string;
  raceType?: string;
  badgeColor: string;
  status: string;
  itra?: number;
  utmbIndex?: string;
}

// Campaign from backend
interface Campaign {
  _id: string;
  uuid: string;
  slug?: string;
  name: string;
  nameTh?: string;
  nameEn?: string;
  description?: string;
  eventDate: string;
  eventEndDate?: string;
  location: string;
  locationTh?: string;
  locationEn?: string;
  pictureUrl?: string;
  status: string;
  categories: RaceCategory[];
  countdownDate?: string;
}

export default function Home() {
  const { theme, toggleTheme } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const { user, isAuthenticated, isAdmin, logout } = useAuth();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  // showUserMenu is now handled by ProfileDropdown component

  useEffect(() => {
    loadCampaigns();
  }, []);

  const loadCampaigns = async () => {
    try {
      // Use proxy route (/api/campaigns) to avoid Mixed Content (HTTPS → HTTP) errors on Vercel
      const response = await fetch('/api/campaigns');
      if (!response.ok) throw new Error('Failed to fetch campaigns');
      const responseData = await response.json();
      // API returns { data: Campaign[], total: number }
      const campaignData = responseData?.data || responseData || [];
      const allCampaigns = Array.isArray(campaignData) ? campaignData : [];
      // Filter out draft campaigns - only show published events to users
      const publishedCampaigns = allCampaigns.filter((c: Campaign & { isDraft?: boolean }) => !c.isDraft);
      setCampaigns(publishedCampaigns);
    } catch (error) {
      console.error('Failed to load campaigns:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string, endDateString?: string) => {
    const date = new Date(dateString);
    const options: Intl.DateTimeFormatOptions = {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    };
    const formatted = date.toLocaleDateString(language === 'th' ? 'th-TH' : 'en-US', options);

    if (endDateString) {
      const endDate = new Date(endDateString);
      const endFormatted = endDate.toLocaleDateString(language === 'th' ? 'th-TH' : 'en-US', options);
      // Return date range for multi-day events
      return `${date.getDate()}-${endDate.getDate()} ${date.toLocaleDateString(language === 'th' ? 'th-TH' : 'en-US', { month: 'long', year: 'numeric' })}`;
    }
    return formatted;
  };

  // Calculate countdown for upcoming campaigns
  const calculateCountdown = (countdownDate?: string) => {
    if (!countdownDate) return undefined;
    const target = new Date(countdownDate);
    const now = new Date();
    const diff = target.getTime() - now.getTime();

    if (diff <= 0) return undefined;

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const secs = Math.floor((diff % (1000 * 60)) / 1000);

    return {
      days: String(days).padStart(2, '0'),
      hours: String(hours).padStart(2, '0'),
      mins: String(mins).padStart(2, '0'),
      secs: String(secs).padStart(2, '0')
    };
  };

  // Get status label based on campaign status
  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'live':
        return { label: 'LIVE NOW', state: 'live' as const };
      case 'finished':
        return { label: language === 'th' ? 'เสร็จสิ้น' : 'Finished', state: 'closed' as const };
      default:
        return { label: language === 'th' ? 'กำลังจะมาถึง' : 'Upcoming', state: 'open' as const };
    }
  };

  // Transform backend categories to ActivityCard format
  const transformCategories = (categories: RaceCategory[]) => {
    return categories.map(cat => ({
      name: cat.name,
      distance: cat.distance,
      start: cat.startTime,
      cutoff: cat.cutoff,
      elevation: cat.elevation,
      type: cat.raceType,
      badgeColor: cat.badgeColor,
      status: cat.status as 'live' | 'wait' | 'finished',
      itra: cat.itra,
      index: cat.utmbIndex
    }));
  };

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      {/* Cursor Spotlight */}
      <CursorSpotlight size={600} />

      {/* Header */}
      <header className="sticky top-0 z-50 glass">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 scale-hover">
            <Image
              src={theme === 'dark' ? '/logo-white.png' : '/logo-black.png'}
              alt="RACETIME"
              width={100}
              height={32}
              className="h-8 sm:h-10 w-auto"
            />
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-6">
          </nav>

          <div className="flex items-center gap-2">
            {/* Desktop Auth - Profile Dropdown with language/theme toggles inside */}
            {isAuthenticated ? (
              <div className="hidden sm:flex items-center gap-2">
                <ProfileDropdown />
              </div>
            ) : (
              <>
                {/* Language Toggle for non-authenticated users */}
                <button
                  onClick={() => setLanguage(language === 'th' ? 'en' : 'th')}
                  className="p-2 rounded-xl glass scale-hover"
                  title={language === 'th' ? 'Switch to English' : 'เปลี่ยนเป็นภาษาไทย'}
                >
                  {language === 'th' ? (
                    <img src="https://flagcdn.com/w40/us.png" alt="EN" className="w-5 h-3.5 object-cover rounded" />
                  ) : (
                    <img src="https://flagcdn.com/w40/th.png" alt="TH" className="w-5 h-3.5 object-cover rounded" />
                  )}
                </button>
                {/* Theme Toggle for non-authenticated users */}
                <button
                  onClick={toggleTheme}
                  className="p-2 rounded-xl glass scale-hover"
                >
                  <span className="text-base">{theme === 'dark' ? '☀️' : '🌙'}</span>
                </button>
                <Link
                  href="/login"
                  className="hidden sm:block px-4 py-2 text-sm font-medium rounded-xl btn-glow text-center min-w-[100px]"
                  style={{ background: 'var(--accent)', color: 'var(--accent-foreground)' }}
                >
                  {t('nav.login')}
                </Link>
              </>
            )}

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-xl glass"
              aria-label="Toggle menu"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--foreground)' }}>
                {mobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden glass border-t" style={{ borderColor: 'var(--border)' }}>
            <nav className="flex flex-col p-4 gap-3">
              {isAuthenticated ? (
                <>
                  <div className="flex items-center gap-3 px-4 py-3 rounded-xl glass">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold overflow-hidden">
                      {user?.avatarUrl ? (
                        <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        user?.firstName?.[0] || user?.email?.[0]?.toUpperCase() || 'U'
                      )}
                    </div>
                    <div>
                      <p className="font-medium" style={{ color: 'var(--foreground)' }}>{user?.firstName} {user?.lastName}</p>
                      <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{user?.email}</p>
                    </div>
                  </div>
                  {isAdmin && (
                    <Link
                      href="/admin/events"
                      onClick={() => setMobileMenuOpen(false)}
                      className="px-4 py-3 rounded-xl text-sm font-medium text-center btn-glow"
                      style={{ background: 'var(--accent)', color: 'var(--accent-foreground)' }}
                    >
                      📋 {language === 'th' ? 'จัดการกิจกรรม' : 'Manage Events'}
                    </Link>
                  )}
                  <Link
                    href="/profile"
                    onClick={() => setMobileMenuOpen(false)}
                    className="px-4 py-3 rounded-xl text-sm font-medium text-center glass"
                    style={{ color: 'var(--foreground)' }}
                  >
                    ⚙️ {language === 'th' ? 'ตั้งค่าโปรไฟล์' : 'Profile Settings'}
                  </Link>
                  {/* Language Toggle - Mobile */}
                  <div className="flex items-center justify-between px-4 py-2 rounded-xl glass">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">🌐</span>
                      <span className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>Language</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <img src="https://flagcdn.com/w40/th.png" alt="TH" className={`w-5 h-3.5 object-cover rounded transition-opacity ${language === 'th' ? 'opacity-100' : 'opacity-40'}`} />
                      <label className="relative inline-block w-10 h-[22px] cursor-pointer">
                        <input type="checkbox" className="sr-only" checked={language === 'en'} onChange={() => setLanguage(language === 'th' ? 'en' : 'th')} />
                        <span className="absolute inset-0 rounded-full transition-colors duration-300" style={{ background: language === 'en' ? '#3b82f6' : '#6b7280' }} />
                        <span className="absolute left-[3px] top-[3px] w-4 h-4 bg-white rounded-full shadow-md transition-transform duration-300" style={{ transform: language === 'en' ? 'translateX(18px)' : 'translateX(0)' }} />
                      </label>
                      <img src="https://flagcdn.com/w40/us.png" alt="EN" className={`w-5 h-3.5 object-cover rounded transition-opacity ${language === 'en' ? 'opacity-100' : 'opacity-40'}`} />
                    </div>
                  </div>
                  {/* Theme Toggle - Mobile */}
                  <div className="flex items-center justify-between px-4 py-2 rounded-xl glass">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{theme === 'dark' ? '🌙' : '☀️'}</span>
                      <span className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>Theme</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm transition-opacity ${theme === 'light' ? 'opacity-100' : 'opacity-40'}`}>☀️</span>
                      <label className="relative inline-block w-10 h-[22px] cursor-pointer">
                        <input type="checkbox" className="sr-only" checked={theme === 'dark'} onChange={toggleTheme} />
                        <span className="absolute inset-0 rounded-full transition-colors duration-300" style={{ background: theme === 'dark' ? '#6366f1' : '#6b7280' }} />
                        <span className="absolute left-[3px] top-[3px] w-4 h-4 bg-white rounded-full shadow-md transition-transform duration-300" style={{ transform: theme === 'dark' ? 'translateX(18px)' : 'translateX(0)' }} />
                      </label>
                      <span className={`text-sm transition-opacity ${theme === 'dark' ? 'opacity-100' : 'opacity-40'}`}>🌙</span>
                    </div>
                  </div>
                  <button
                    onClick={() => { logout(); setMobileMenuOpen(false); }}
                    className="px-4 py-3 rounded-xl text-sm font-medium text-center border"
                    style={{ borderColor: 'var(--error)', color: 'var(--error)' }}
                  >
                    {language === 'th' ? 'ออกจากระบบ' : 'Logout'}
                  </button>
                </>
              ) : (
                <>
                  <Link
                    href="/login"
                    onClick={() => setMobileMenuOpen(false)}
                    className="px-4 py-3 rounded-xl text-sm font-medium text-center btn-glow"
                    style={{ background: 'var(--accent)', color: 'var(--accent-foreground)' }}
                  >
                    {t('nav.login')}
                  </Link>
                  <Link
                    href="/register"
                    onClick={() => setMobileMenuOpen(false)}
                    className="px-4 py-3 rounded-xl text-sm font-medium text-center border"
                    style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
                  >
                    {language === 'th' ? 'สมัครสมาชิก' : 'Register'}
                  </Link>
                </>
              )}
            </nav>
          </div>
        )}
      </header>

      {/* Hero Section */}
      <section className="relative z-10 px-4 sm:px-6 overflow-hidden min-h-[50vh] flex items-center justify-center" style={{ background: 'var(--background)' }}>
        <div className="max-w-4xl mx-auto w-full text-center flex flex-col items-center justify-center">
          <h1 className="text-3xl sm:text-5xl font-bold mb-4 tracking-tight" style={{ color: 'var(--foreground)' }}>
            {t('hero.title1')} <span style={{ color: 'var(--accent)' }}>RFID</span> {t('hero.title2')}
          </h1>
          <p className="text-base sm:text-lg max-w-2xl" style={{ color: 'var(--muted-foreground)' }}>
            {t('hero.subtitle')}
          </p>
        </div>
      </section>

      {/* Events Section - UTMB Style */}
      <section id="events" className="relative z-10 py-12 px-4 sm:px-6" style={{ background: 'var(--muted)' }}>
        <div className="max-w-5xl mx-auto ">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-3xl font-bold" style={{ color: 'var(--foreground)' }}>
              {t('events.title')}
            </h2>
          </div>

          <div className="flex flex-col gap-6">
            {loading ? (
              <div className="text-center py-12" style={{ color: 'var(--muted-foreground)' }}>
                {language === 'th' ? 'กำลังโหลดกิจกรรม...' : 'Loading events...'}
              </div>
            ) : campaigns.length === 0 ? (
              <div className="text-center py-12" style={{ color: 'var(--muted-foreground)' }}>
                {language === 'th' ? 'ไม่มีกิจกรรมในขณะนี้' : 'No events available'}
              </div>
            ) : (
              campaigns.map((campaign) => (
                <ActivityCard
                  key={campaign._id}
                  id={campaign.uuid}
                  title={campaign.name}
                  titleTh={campaign.nameTh}
                  titleEn={campaign.nameEn}
                  location={campaign.location}
                  locationTh={campaign.locationTh}
                  locationEn={campaign.locationEn}
                  date={formatDate(campaign.eventDate, campaign.eventEndDate)}
                  imageUrl={campaign.pictureUrl || 'https://images.unsplash.com/photo-1516214104703-d870798883c5?auto=format&fit=crop&w=600&q=80'}
                  color={campaign.categories[0]?.badgeColor || 'var(--accent)'}
                  link={`/event/${campaign.slug || campaign._id}`}
                  status={getStatusInfo(campaign.status)}
                  countdown={campaign.status === 'upcoming' ? calculateCountdown(campaign.countdownDate || campaign.eventDate) : undefined}
                  categories={transformCategories(campaign.categories)}
                />
              ))
            )}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 py-10 px-6 glass">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Image
              src={theme === 'dark' ? '/logo-white.png' : '/logo-black.png'}
              alt="RACETIME"
              width={100}
              height={32}
              className="h-8 w-auto"
            />
            <span className="text-sm" style={{ color: 'var(--muted-foreground)' }}>© 2026. All rights reserved.</span>
          </div>
          <div className="flex items-center gap-6 text-sm">
            <a href="#" className="link-underline" style={{ color: 'var(--muted-foreground)' }}>Privacy</a>
            <a href="#" className="link-underline" style={{ color: 'var(--muted-foreground)' }}>Terms</a>
            <a href="#" className="link-underline" style={{ color: 'var(--muted-foreground)' }}>Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
