import type { Route } from '../lib/route.js';
import { Button } from '../ui/Button.js';
import { Shell } from '../ui/Shell.js';

// TODO(friend-mode): placeholder so practice mode can be built and tested first. Replaced next.
export function FriendRoot({ go }: { route: Route; go: (route: Route) => void }) {
  return (
    <Shell title="Play a friend" onBack={() => go({ name: 'home' })}>
      <p className="py-6">Coming next.</p>
      <Button onClick={() => go({ name: 'home' })}>Home</Button>
    </Shell>
  );
}
