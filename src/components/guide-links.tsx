import { ExternalLink } from "lucide-react";

const guides = [
  { label: "Portal guide", path: "/docs/learn/akash-sink/portal" },
  { label: "About the bridge", path: "/docs/learn/akash-sink" },
  { label: "Mainnet addresses", path: "/docs/learn/akash-sink/mainnet" },
];

export function GuideLinks() {
  return (
    <nav
      aria-label="Bridge guides"
      className="wrap flex flex-wrap gap-x-6 gap-y-3 pt-5"
    >
      {guides.map((guide) => (
        <a
          key={guide.path}
          href={`https://akash.network${guide.path}`}
          target="_blank"
          rel="noopener noreferrer"
          className="lnk inline-flex items-center gap-1.5 text-sm"
        >
          {guide.label}
          <ExternalLink className="size-3.5" aria-hidden="true" />
        </a>
      ))}
    </nav>
  );
}
