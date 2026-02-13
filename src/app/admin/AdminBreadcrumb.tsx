'use client';

import Link from 'next/link';
import { useLanguage } from '@/lib/language-context';
import { ReactNode } from 'react';

interface BreadcrumbItem {
    label: string;
    labelEn?: string;
    href?: string;
}

interface AdminBreadcrumbProps {
    items: BreadcrumbItem[];
    rightContent?: ReactNode;
}

export default function AdminBreadcrumb({ items, rightContent }: AdminBreadcrumbProps) {
    const { language } = useLanguage();

    return (
        <nav className="admin-breadcrumb">
            <div className="breadcrumb-left">
                <Link href="/admin/events" className="breadcrumb-link">Admin</Link>
                {items.map((item, index) => (
                    <span key={index}>
                        <span className="breadcrumb-separator">/</span>
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
            </div>
            {rightContent && (
                <div className="breadcrumb-right">
                    {rightContent}
                </div>
            )}
        </nav>
    );
}
