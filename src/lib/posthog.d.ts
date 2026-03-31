declare module 'posthog-js' {
  interface PostHogConfig {
    api_host?: string;
    capture_pageview?: boolean;
    persistence?: string;
    advanced_disable_feature_flags?: boolean;
  }

  interface PostHog {
    init(key: string, config?: PostHogConfig): void;
    capture(event: string, properties?: Record<string, unknown>): void;
    identify(userId: string, properties?: Record<string, unknown>): void;
    reset(): void;
  }

  const posthog: PostHog;
  export default posthog;
}
