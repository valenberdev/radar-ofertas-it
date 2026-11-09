export interface DailyQuota {
  tryConsume(units: number): Promise<boolean>;
}
