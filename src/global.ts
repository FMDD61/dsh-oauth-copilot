// Local type augmentation for host seams this plugin consumes. The plugin is
// compiled against its own dependency tree, not the host's, so the shapes are
// restated here (same contract the host's dsh-system-prompt declares).

/** Host system-prompt seam: injects guidance sections into agent instructions. */
export interface SystemPromptService {
  section(section: {
    name: string
    order?: number
    text: string[] | string
  }): void
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    systemPrompt: SystemPromptService
  }
}
