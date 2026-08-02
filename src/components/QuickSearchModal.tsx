import React, { useState, useEffect, useMemo, useRef } from 'react';
import Fuse from 'fuse.js';
import { Search } from 'lucide-react';

interface SearchClone {
    id: string;
    data: {
        name: string;
        language: string;
        vibe_summary: string;
        github_stars: number;
        tags: string[];
    };
}

interface Props {
    clones: SearchClone[];
}

function formatStars(stars: number): string {
    return stars >= 1000 ? `${(stars / 1000).toFixed(stars >= 10_000 ? 0 : 1)}k` : String(stars);
}

const QuickSearchModal: React.FC<Props> = ({ clones }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const dialogRef = useRef<HTMLDivElement>(null);
    // Focus has to return to whatever opened the dialog, not to the top of the page.
    const openerRef = useRef<HTMLElement | null>(null);

    const fuse = useMemo(() => new Fuse(clones, {
        keys: ['data.name', 'data.vibe_summary', 'data.tags', 'data.language', 'id'],
        threshold: 0.3,
        ignoreLocation: true,
    }), [clones]);

    const results = useMemo(() => {
        if (!searchQuery.trim()) return [];
        return fuse.search(searchQuery).map(r => r.item).slice(0, 8);
    }, [searchQuery, fuse]);

    useEffect(() => {
        const handleOpen = () => setIsOpen(true);
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                setIsOpen(prev => !prev);
            }
            if (e.key === 'Escape') setIsOpen(false);
        };

        window.addEventListener('open-quick-search', handleOpen);
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('open-quick-search', handleOpen);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, []);

    useEffect(() => {
        if (isOpen) {
            openerRef.current = document.activeElement as HTMLElement | null;
            const timer = setTimeout(() => inputRef.current?.focus(), 50);
            setSelectedIndex(0);
            document.body.style.overflow = 'hidden';
            return () => clearTimeout(timer);
        }

        setSearchQuery('');
        document.body.style.overflow = '';
        openerRef.current?.focus?.();
    }, [isOpen]);

    // Tab must not walk out of an open dialog into the page behind it.
    useEffect(() => {
        if (!isOpen) return;

        const trapFocus = (event: KeyboardEvent) => {
            if (event.key !== 'Tab' || !dialogRef.current) return;
            const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
                'a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])',
            );
            if (focusable.length === 0) return;

            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };

        document.addEventListener('keydown', trapFocus);
        return () => document.removeEventListener('keydown', trapFocus);
    }, [isOpen]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (results.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(prev => (prev + 1) % results.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(prev => (prev - 1 + results.length) % results.length);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (results[selectedIndex]) {
                window.location.href = `/clones/${results[selectedIndex].id}`;
                setIsOpen(false);
            }
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[9999] flex items-start justify-center px-4 pt-[12vh]">
            <div
                className="absolute inset-0 bg-black/50 dark:bg-black/70 animate-fade-in"
                onClick={() => setIsOpen(false)}
            />

            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-label="Search tracked clones"
                className="relative w-full max-w-2xl max-h-[70vh] flex flex-col bg-paper border hairline rounded-sm overflow-hidden"
            >
                <div className="px-5 py-3.5 border-b hairline flex items-center gap-3">
                    <Search className="text-pale-slate-400 shrink-0" size={16} aria-hidden="true" />
                    <input
                        ref={inputRef}
                        type="text"
                        placeholder="Search by name, language or tag"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                        aria-label="Search tracked clones"
                        className="flex-1 min-w-0 bg-transparent text-ink dark:text-white text-[15px] outline-none placeholder-pale-slate-400 font-sans"
                    />
                    <button
                        type="button"
                        onClick={() => setIsOpen(false)}
                        aria-label="Close search"
                        className="shrink-0 font-mono text-[11px] border hairline rounded-sm px-2 py-1 text-pale-slate-500 hover:text-ink dark:hover:text-white transition-colors duration-150"
                    >
                        ESC
                    </button>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                    {searchQuery.trim() === '' ? (
                        <p className="px-5 py-10 text-center font-mono text-[12px] text-pale-slate-400">
                            Type to search {clones.length} tracked clones.
                        </p>
                    ) : results.length > 0 ? (
                        results.map((clone, index) => (
                            <a
                                key={clone.id}
                                href={`/clones/${clone.id}`}
                                onMouseEnter={() => setSelectedIndex(index)}
                                aria-current={index === selectedIndex ? 'true' : undefined}
                                className={`flex items-center justify-between gap-4 px-5 py-3.5 border-b hairline transition-colors duration-150 ${
                                    index === selectedIndex
                                        ? 'bg-accent/5 dark:bg-accent-soft/[0.06] shadow-[inset_2px_0_0_0_var(--color-accent)]'
                                        : 'hover:bg-black/[0.02] dark:hover:bg-white/[0.03]'
                                }`}
                            >
                                <div className="min-w-0">
                                    <div className="text-[15px] font-medium tracking-[-0.01em] truncate">
                                        {clone.data.name}
                                    </div>
                                    <p className="mt-0.5 text-[12px] text-pale-slate-500 dark:text-pale-slate-400 line-clamp-1">
                                        {clone.data.vibe_summary}
                                    </p>
                                </div>
                                <span className="shrink-0 font-mono text-[11px] tabular-nums text-pale-slate-400 whitespace-nowrap">
                                    {clone.data.language} · {formatStars(clone.data.github_stars)}
                                </span>
                            </a>
                        ))
                    ) : (
                        <p className="px-5 py-10 text-center font-mono text-[12px] text-pale-slate-400">
                            No clones match “{searchQuery}”.
                        </p>
                    )}
                </div>

                <div className="px-5 py-2.5 border-t hairline flex items-center justify-between gap-4 font-mono text-[10px] uppercase tracking-[0.14em] text-pale-slate-400">
                    <span>↑↓ navigate · ↵ open</span>
                    <span>⌘K toggle</span>
                </div>
            </div>

            <style>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 4px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: var(--color-line);
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: color-mix(in srgb, var(--color-ink) 20%, transparent);
                }
            `}</style>
        </div>
    );
};

export default QuickSearchModal;
