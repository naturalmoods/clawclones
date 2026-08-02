import React from 'react';
import { Search } from 'lucide-react';

const QuickSearchButton: React.FC = () => {
    const handleOpen = () => {
        window.dispatchEvent(new CustomEvent('open-quick-search'));
    };

    return (
        <button
            onClick={handleOpen}
            className="flex items-center gap-2 px-3 py-1.5 rounded-sm border hairline hover:border-ink dark:hover:border-white transition-colors duration-150 group/search cursor-pointer"
            title="Search clones (CMD+K)"
        >
            <Search size={14} className="text-pale-slate-500" />
            {/*
              The caption and the shortcut hint only appear where they do not
              compete with the flattened six-item nav: between `lg` and `xl`
              the bar needs that width for the links themselves.
            */}
            <span className="font-mono text-[11px] text-pale-slate-500 hidden sm:inline lg:hidden xl:inline">Search clones</span>
            <div className="hidden xl:flex items-center gap-1 ml-2">
                <span className="px-1.5 py-0.5 rounded-sm border hairline font-mono text-[10px] text-pale-slate-500">⌘</span>
                <span className="px-1.5 py-0.5 rounded-sm border hairline font-mono text-[10px] text-pale-slate-500">K</span>
            </div>
        </button>
    );
};

export default QuickSearchButton;
