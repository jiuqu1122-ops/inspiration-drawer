import ReactMarkdown from 'react-markdown';
import { version } from '../../../package.json';

const notes = import.meta.glob<string>('../../../docs/releases/[0-9]*.md', {
  query: '?raw', import: 'default', eager: true,
});
const pathFor = (release: string) => `../../../docs/releases/${release}.md`;
const previousVersions = Object.keys(notes)
  .map(path => path.split('/').pop()!.replace(/\.md$/, ''))
  .filter(release => release !== version)
  .sort((a, b) => b.localeCompare(a, 'en', { numeric: true }));

function Notes({ release }: { release: string }) {
  return <div className="[&_li+li]:mt-1 [&_p+p]:mt-2 [&_strong]:font-semibold">
    <ReactMarkdown>{notes[pathFor(release)]}</ReactMarkdown>
  </div>;
}

export function DesktopReleaseNotes({ showHistory = false }: { showHistory?: boolean }) {
  return <>
    {showHistory && <h3 className="font-bold text-stone-800 dark:text-stone-100">v{version}</h3>}
    <Notes release={version} />
    {showHistory && previousVersions.length > 0 && <details className="pt-1">
      <summary className="cursor-pointer font-semibold">历史版本</summary>
      {previousVersions.map(release => <details key={release} className="mt-2 pl-2">
        <summary className="cursor-pointer">v{release}</summary>
        <Notes release={release} />
      </details>)}
    </details>}
  </>;
}
