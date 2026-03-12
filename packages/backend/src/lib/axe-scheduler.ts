import { SchedulerClient, CreateScheduleCommand, DeleteScheduleCommand } from '@aws-sdk/client-scheduler';

const scheduler = new SchedulerClient({});

const SCHEDULER_ROLE_ARN = process.env.SCHEDULER_ROLE_ARN ?? '';
const AXE_TIMEOUT_LAMBDA_ARN = process.env.AXE_TIMEOUT_LAMBDA_ARN ?? '';

function scheduleName(roomCode: string): string {
  return `axe-timeout-${roomCode.toLowerCase()}`;
}

/**
 * Create a one-shot EventBridge Scheduler rule that fires at `deadlineMs`
 * and calls the axe-timeout Lambda with { roomCode }.
 */
export async function scheduleAxeTimeout(roomCode: string, deadlineMs: number): Promise<void> {
  if (!SCHEDULER_ROLE_ARN || !AXE_TIMEOUT_LAMBDA_ARN) return; // skip in local dev

  const at = new Date(deadlineMs);
  // EventBridge Scheduler cron format: at(yyyy-MM-ddThh:mm:ss)
  const atStr = at.toISOString().slice(0, 19); // "2024-06-01T12:34:56"

  await scheduler.send(new CreateScheduleCommand({
    Name: scheduleName(roomCode),
    ScheduleExpression: `at(${atStr})`,
    ScheduleExpressionTimezone: 'UTC',
    FlexibleTimeWindow: { Mode: 'OFF' },
    Target: {
      Arn: AXE_TIMEOUT_LAMBDA_ARN,
      RoleArn: SCHEDULER_ROLE_ARN,
      Input: JSON.stringify({ roomCode, playerId: '__scheduler__', action: 'axe-skip', use: Math.random() < 0.5 }),
    },
    ActionAfterCompletion: 'DELETE',
  }));
}

/** Delete the schedule if the runner responds in time. */
export async function cancelAxeTimeout(roomCode: string): Promise<void> {
  if (!SCHEDULER_ROLE_ARN) return;
  try {
    await scheduler.send(new DeleteScheduleCommand({ Name: scheduleName(roomCode) }));
  } catch {
    // Already fired or doesn't exist — ignore
  }
}
