export interface GitHubData {
    repoInfo: any;
    readme: string;
    recentCommits: string;
    latestRelease: {
        version: string;
        date: string;
        url: string;
    } | null;
    licenseType: string | null;
    lastCommitAt: string | null;
    contributorsCount: number | null;
    openIssuesCount: number | null;
    releaseCadenceDays: number | null;
}

export interface RedditPost {
    title: string;
    url: string;
    score: number;
    num_comments: number;
    clone: string;
    subreddit: string;
    text: string;
    created_utc: number;
    created_readable?: string;
}

export interface RedditData {
    matches: number;
    posts: RedditPost[];
}

export interface BraveSnippet {
    title: string;
    description: string;
}

export interface BraveData {
    matches: number;
    snippets: BraveSnippet[];
}

export type CloudDependency = 'required' | 'optional' | 'none' | 'unknown';
export type SetupDifficulty = 'low' | 'medium' | 'high' | 'unknown';
export type PrivacyPosture = 'strong' | 'mixed' | 'weak' | 'unknown';
export type PluginEcosystem = 'strong' | 'emerging' | 'limited' | 'unknown';
export type OperationalRisk = 'low' | 'medium' | 'high' | 'unknown';
export type RefreshMode = 'refresh' | 'review' | 'rewrite';

export interface ContentOpsMetadata {
    last_generated_at?: string;
    last_reviewed_at?: string;
    refresh_mode?: RefreshMode;
    source_window?: string;
    change_reason?: string;
    generation_version?: string;
}

export interface CloneData {
    id: string;
    name: string;
    language: string;
    vibe_summary: string;
    health_status: 'healthy' | 'warning' | 'abandoned';
    github_stars: number;
    metrics: {
        boot_time_ms: number;
        memory_mb: number;
        security_score: number;
    };
    radar_chart: {
        sandboxing: number;
        api_security: number;
        network_isolation: number;
        telemetry_safety: number;
        shell_access_risk: number;
    };
    tags: string[];
    community_sentiment: number;
    reddit_mentions: number;
    web_mentions?: number;
    best_for?: string[];
    avoid_if?: string[];
    deployment_target?: string[];
    local_first?: boolean | null;
    cloud_dependency?: CloudDependency;
    setup_difficulty?: SetupDifficulty;
    privacy_posture?: PrivacyPosture;
    multi_user?: boolean | null;
    plugin_ecosystem?: PluginEcosystem;
    license_type?: string | null;
    last_commit_at?: string | null;
    contributors_count?: number | null;
    open_issues_count?: number | null;
    release_cadence_days?: number | null;
    operational_risk?: OperationalRisk;
    openclaw_advantages?: string[];
    openclaw_disadvantages?: string[];
    confidence_summary?: string;
    evidence_confidence?: number;
    content_ops?: ContentOpsMetadata;
    overview_markdown: string;
    latest_release?: {
        version: string;
        date: string;
        url: string;
    };
    last_updated: string;
}
