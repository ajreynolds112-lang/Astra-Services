type RepositoryStatus = "yes" | "no" | "unknown";
interface GithubRepositories {
  status: RepositoryStatus;
  urls: string[];
}

/** Validate link text only. Never fetch client-supplied URLs or request repository access. */
export function parseGithubRepositories(
  status: RepositoryStatus = "unknown",
  links: string[] = [],
): GithubRepositories {
  if (links.length > 100) throw new Error("You can provide up to 100 GitHub repository links.");
  const urls = links.map((link) => link.trim()).filter(Boolean).map((link) => {
    try {
      const url = new URL(link);
      const parts = url.pathname.replace(/\/$/, "").split("/");
      const owner = parts[1];
      const repo = parts[2]?.replace(/\.git$/, "");
      if (url.protocol !== "https:" || !["github.com", "www.github.com"].includes(url.hostname)
        || url.port || url.username || url.password || url.search || url.hash || parts.length !== 3
        || !/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(owner ?? "")
        || !/^[a-z\d_.-]{1,100}$/i.test(repo ?? "") || repo === "." || repo === "..") {
        throw new Error("invalid");
      }
      return `https://github.com/${owner}/${repo}`;
    } catch {
      throw new Error("Enter a GitHub repository link such as https://github.com/owner/repository.");
    }
  });
  if (status === "yes" && urls.length === 0) {
    throw new Error("Add at least one GitHub repository link, or leave the answer blank if you're not sure.");
  }
  if (status === "no" && urls.length) {
    throw new Error("Choose Yes if you're providing GitHub repository links.");
  }
  return { status: urls.length ? "yes" : status, urls };
}

/** Three canonical URLs per value keeps even 100 links within Stripe's 50-key/500-character limits. */
export function githubRepositoryMetadata({ status, urls }: GithubRepositories): Record<string, string> {
  const metadata: Record<string, string> = { github_repository_status: status };
  for (let i = 0; i < urls.length; i += 3) {
    metadata[`github_repos_${String(i / 3 + 1).padStart(2, "0")}`] = urls.slice(i, i + 3).join("\n");
  }
  return metadata;
}