"use client";

import { useState, useEffect } from "react";
import { DocSection, docLink } from "@/components/docs-prose";
import Link from "next/link";

interface GitHubCommit {
  sha: string;
  message: string;
  date: string;
  url: string;
  author: string;
}

// Simple helper for relative time
function getRelativeTime(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return "just now";
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
  return date.toLocaleDateString();
}

export function GitHubActivity() {
  const [githubData, setGithubData] = useState<{ totalCommits: string; recentCommits: GitHubCommit[] } | null>(null);
  const [isLoadingGithub, setIsLoadingGithub] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch("/api/github/stats");
        if (res.ok) {
          const data = await res.json();
          setGithubData(data);
        }
      } catch (error) {
        console.error("Failed to fetch GitHub stats:", error);
      } finally {
        setIsLoadingGithub(false);
      }
    }
    fetchStats();
  }, []);

  return (
    <DocSection id="activity" title="Recent development">
      <p>
        Latest commits to the Scorpio repository
        {githubData ? ` (${githubData.totalCommits} total)` : ""}.{" "}
        <Link href="https://github.com/RushilMahadevu/scorpio/commits/main" target="_blank" className={docLink}>
          View all
        </Link>
      </p>
      <ul className="divide-y divide-border/40 border-y border-border/40">
        {isLoadingGithub ? (
          [...Array(3)].map((_, i) => (
            <li key={i} className="py-3">
              <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
            </li>
          ))
        ) : githubData?.recentCommits.map((commit) => (
          <li key={commit.sha} className="flex items-baseline gap-3 py-2.5">
            <Link href={commit.url} target="_blank" className="shrink-0 font-mono text-xs text-muted-foreground hover:text-foreground">
              {commit.sha.substring(0, 7)}
            </Link>
            <span className="min-w-0 flex-1 truncate text-foreground">{commit.message}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{getRelativeTime(commit.date)}</span>
          </li>
        ))}
      </ul>
      {!isLoadingGithub && !githubData && (
        <p>
          Unable to load activity. Check <Link href="https://github.com/RushilMahadevu/scorpio" className={docLink}>GitHub</Link> for the latest updates.
        </p>
      )}
    </DocSection>
  );
}
