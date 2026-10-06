import type { ReactNode } from 'react';
import { useRoute } from './lib/useRoute.js';
import { FriendRoot } from './friend/FriendRoot.js';
import { Home } from './screens/Home.js';
import { How } from './screens/How.js';
import { Practice } from './screens/Practice.js';
import { Stats } from './screens/Stats.js';
import { Button } from './ui/Button.js';
import { Shell } from './ui/Shell.js';

export function App(): ReactNode {
  const [route, go] = useRoute();
  const home = (): void => go({ name: 'home' });

  switch (route.name) {
    case 'home':
      return (
        <Home
          onPractice={() => go({ name: 'practice' })}
          onFriend={() => go({ name: 'friend' })}
          onHow={() => go({ name: 'how' })}
          onStats={() => go({ name: 'stats' })}
        />
      );
    case 'how':
      return <How onBack={home} onPlay={() => go({ name: 'practice' })} />;
    case 'stats':
      return <Stats onBack={home} />;
    case 'practice':
      return <Practice onBack={home} />;
    case 'friend':
    case 'room':
      return <FriendRoot route={route} go={go} />;
    case 'notfound':
      return (
        <Shell title="Not found" onBack={home}>
          <div className="flex flex-1 flex-col justify-center gap-4">
            <p>
              That link does not look right. Room codes are six letters and numbers, like ABC234.
            </p>
            <Button onClick={home}>Home</Button>
          </div>
        </Shell>
      );
  }
}
