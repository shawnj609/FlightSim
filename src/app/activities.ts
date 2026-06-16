import { type ChallengeId, challengeLabels } from '../sim/challenges';
import { type SceneId } from '../scene/worlds';

export type ActivityId = 'tutorial' | 'freeFlight' | ChallengeId;

export const activityLabels: Record<ActivityId, string> = {
  tutorial: 'Tutorial',
  freeFlight: 'Free flight',
  ...challengeLabels
};

const arenaActivities: ActivityId[] = ['tutorial', 'stationKeeping', 'ringRun', 'spotLanding', 'stagePass', 'noseIn'];
const outdoorActivities: ActivityId[] = ['freeFlight', 'tutorial', 'ringRun', 'stationKeeping', 'spotLanding'];

export function availableActivities(scene: SceneId): ActivityId[] {
  return scene === 'arena' ? arenaActivities : outdoorActivities;
}

export function defaultActivity(scene: SceneId): ActivityId {
  return scene === 'arena' ? 'tutorial' : 'freeFlight';
}

export function isChallenge(activity: ActivityId): activity is ChallengeId {
  return activity !== 'tutorial' && activity !== 'freeFlight';
}
