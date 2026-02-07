'use client';

import Link from 'next/link';
import { useLanguage } from '@/lib/language-context';

interface BreadcrumbItem {
    label: string;
    labelEn?: string;
    href?: string;
}

interface AdminBreadcrumbProps {
    items: BreadcrumbItem[];
}

export default function AdminBreadcrumb({ items }: AdminBreadcrumbProps) {
    const { language } = useLanguage();

    return (
        <nav className="admin-breadcrumb">
            <Link href="/" className="breadcrumb-link">
                {language === 'th' ? 'หน้าหลัก' : 'Home'}
            </Link>
            {items.map((item, index) => (
                <span key={index}>
                    <span className="breadcrumb-separator">»</span>
                    {item.href ? (
                        <Link href={item.href} className="breadcrumb-link">
                            {language === 'th' ? item.label : (item.labelEn || item.label)}
                        </Link>
                    ) : (
                        <span className="breadcrumb-current">
                            {language === 'th' ? item.label : (item.labelEn || item.label)}
                        </span>
                    )}
                </span>
            ))}
        </nav>
    );
}
