import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'child_process';
import { NewsRepository } from '../repositories/news.repository';
import { NewsPgRepository } from '../repositories/news-pg.repository';

// Claude CLI default path
const DEFAULT_CLAUDE_CLI_PATH = '/opt/homebrew/bin/claude';

// Helper function to run Claude CLI with proper environment
function runClaudeCLI(cliPath: string, prompt: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      cliPath,
      ['-p', prompt, '--output-format', 'text'],
      {
        env: {
          ...process.env,
          PATH: '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin',
          HOME: process.env.HOME || '/Users/user',
        },
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: false,
      },
    );

    // Close stdin immediately so CLI doesn't wait for input
    if (child.stdin) {
      child.stdin.end();
    }

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code, signal) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`Process exited with code ${code}, signal ${signal}. stdout: ${stdout.substring(0, 200)}. stderr: ${stderr.substring(0, 200)}`));
      }
    });

    child.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    // Set a timeout (120 seconds to allow for Claude CLI response)
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      setTimeout(() => {
        if (!child.killed) {
          child.kill('SIGKILL');
        }
      }, 5000);
      reject(new Error('Translation timeout after 120 seconds'));
    }, 120000);
  });
}

interface TranslatedNews {
  titleKo: string;
  summaryKo: string | null;
}

@Injectable()
export class TranslationService {
  private readonly logger = new Logger(TranslationService.name);
  private isClaudeAvailable = false;
  private readonly claudeCliPath: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly newsRepository: NewsRepository,
    private readonly newsPgRepository: NewsPgRepository,
  ) {
    this.claudeCliPath =
      this.configService.get<string>('CLAUDE_CLI_PATH') || DEFAULT_CLAUDE_CLI_PATH;
    this.checkClaudeAvailability();
  }

  private async checkClaudeAvailability(): Promise<void> {
    try {
      const fs = await import('fs');
      if (!this.claudeCliPath.includes('/')) {
        this.isClaudeAvailable = true;
        this.logger.log(`Claude CLI will resolve from PATH: ${this.claudeCliPath}`);
        return;
      }

      if (fs.existsSync(this.claudeCliPath)) {
        this.isClaudeAvailable = true;
        this.logger.log(`Claude CLI available at ${this.claudeCliPath}`);
      } else {
        this.isClaudeAvailable = false;
        this.logger.warn(`Claude CLI not found at ${this.claudeCliPath} - translation disabled`);
      }
    } catch {
      this.isClaudeAvailable = false;
      this.logger.warn('Claude CLI check failed - translation disabled');
    }
  }

  /**
   * Translate a single news item and save to Redis
   */
  async translateAndSave(newsId: string, title: string, summary?: string): Promise<TranslatedNews | null> {
    if (!this.isClaudeAvailable) {
      return null;
    }

    try {
      const cleanTitle = this.sanitizeText(title, 200);
      const cleanSummary = summary ? this.sanitizeText(summary, 800) : '';

      this.logger.log(`Translating: ${cleanTitle.substring(0, 50)}...`);

      let translated: TranslatedNews | null = null;
      let skipSummary = false;
      if (cleanSummary) {
        try {
          translated = await this.translateTitleAndSummary(cleanTitle, cleanSummary);
        } catch (error: any) {
          if (this.isTokenLimitError(error)) {
            skipSummary = true;
            this.logger.warn('Token limit reached - skipping summary translation');
          } else {
            throw error;
          }
        }
      }

      if (!translated) {
        const titleKo = await this.translateTitle(cleanTitle);
        if (!titleKo) {
          return null;
        }

        let summaryKo: string | null = '';
        if (cleanSummary && !skipSummary) {
          try {
            summaryKo = await this.summarizeSummary(cleanTitle, cleanSummary);
          } catch (error: any) {
            if (this.isTokenLimitError(error)) {
              skipSummary = true;
              summaryKo = null;
              this.logger.warn('Token limit reached - skipping summary translation');
            } else {
              throw error;
            }
          }
        } else if (skipSummary) {
          summaryKo = null;
        }

        translated = {
          titleKo,
          summaryKo: skipSummary ? null : summaryKo,
        };
      }

      // Save translation to Redis cache (if available) and PostgreSQL
      if (this.newsRepository.isAvailable()) {
        await this.newsRepository.updateTranslation(
          newsId,
          translated.titleKo,
          translated.summaryKo,
        );
      }
      await this.newsPgRepository.updateTranslation(
        newsId,
        translated.titleKo,
        translated.summaryKo,
      );
      this.logger.log(
        `Translated and saved: ${cleanTitle.substring(0, 40)}... -> ${translated.titleKo.substring(0, 40)}...`,
      );
      return translated;
    } catch (error: any) {
      this.logger.error(`Translation failed for ${newsId}: ${error?.message || error}`);
      return null;
    }
  }

  /**
   * Translate batch of news items (called by background job)
   */
  async translateBatch(
    newsItems: Array<{ id: string; title: string; summary?: string }>,
  ): Promise<{ success: number; failed: number }> {
    if (!this.isClaudeAvailable || newsItems.length === 0) {
      return { success: 0, failed: 0 };
    }

    this.logger.log(`Starting batch translation: ${newsItems.length} items`);

    let success = 0;
    let failed = 0;

    for (const item of newsItems) {
      try {
        const result = await this.translateAndSave(item.id, item.title, item.summary);
        if (result) {
          success++;
        } else {
          failed++;
        }

        // Add delay between API calls to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error: any) {
        this.logger.error(`Batch translation failed for ${item.id}: ${error?.message}`);
        failed++;
      }
    }

    this.logger.log(`Batch translation complete: ${success} success, ${failed} failed`);
    return { success, failed };
  }

  /**
   * Check if Claude CLI is available
   */
  isAvailable(): boolean {
    return this.isClaudeAvailable;
  }

  private sanitizeText(text: string, maxLength: number): string {
    return text
      .replace(/[\r\n]+/g, ' ')
      .replace(/['"\\`$]/g, '')
      .trim()
      .substring(0, maxLength);
  }

  private async translateTitleAndSummary(
    title: string,
    summary: string,
  ): Promise<TranslatedNews | null> {
    const prompt = [
      '당신은 미국 주식 뉴스 전문 번역가이자 요약가입니다.',
      '다음 영어 제목과 요약을 한국어로 번역하고 요약은 2문장 이내로 간결하게 정리하세요.',
      '출력은 아래 형식 2줄만 사용하세요. 다른 텍스트는 출력하지 마세요.',
      'TITLE_KO: ...',
      'SUMMARY_KO: ...',
      `제목: ${title}`,
      `요약: ${summary}`,
    ].join('\n');

    const { stdout } = await runClaudeCLI(this.claudeCliPath, prompt);
    const parsed = this.parseTaggedOutput(stdout);
    if (!parsed) {
      this.logger.warn('Combined translation output could not be parsed');
    }

    return parsed;
  }

  private async translateTitle(title: string): Promise<string | null> {
    const prompt = [
      '당신은 미국 주식 뉴스 전문 번역가입니다.',
      '다음 영문 뉴스 제목을 한국어로 번역해주세요. 금융/투자 전문 용어를 사용하고 번역 결과만 출력하세요.',
      `제목: ${title}`,
    ].join('\n');

    const { stdout } = await runClaudeCLI(this.claudeCliPath, prompt);
    const translatedTitle = stdout.trim();
    if (!translatedTitle || translatedTitle.toLowerCase().includes('error')) {
      this.logger.warn('Title translation returned empty');
      return null;
    }

    return translatedTitle;
  }

  private async summarizeSummary(title: string, summary: string): Promise<string> {
    const prompt = [
      '다음 영문 뉴스 제목과 요약을 한국어로 2문장 이내로 간결하게 요약하세요.',
      '요약 결과만 출력하세요.',
      `제목: ${title}`,
      `요약: ${summary}`,
    ].join('\n');

    const { stdout } = await runClaudeCLI(this.claudeCliPath, prompt);
    const summarized = stdout.trim();
    if (!summarized || summarized.toLowerCase().includes('error')) {
      this.logger.warn('Summary translation returned empty');
      return '';
    }

    return summarized;
  }

  private parseTaggedOutput(output: string): TranslatedNews | null {
    const lines = output
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    const titleLine = lines.find((line) => line.startsWith('TITLE_KO:'));
    const summaryLine = lines.find((line) => line.startsWith('SUMMARY_KO:'));

    if (!titleLine || !summaryLine) {
      return null;
    }

    const titleKo = titleLine.replace('TITLE_KO:', '').trim();
    const summaryKo = summaryLine.replace('SUMMARY_KO:', '').trim();

    if (!titleKo) {
      return null;
    }

    return { titleKo, summaryKo };
  }

  private isTokenLimitError(error: unknown): boolean {
    if (!error) {
      return false;
    }

    const message =
      typeof error === 'string'
        ? error
        : error instanceof Error
          ? error.message
          : String(error);

    return /token limit|max tokens|context length|context window/i.test(message);
  }
}
