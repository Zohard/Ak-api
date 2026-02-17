import { Injectable, Logger } from '@nestjs/common';

interface DeepLTranslationResponse {
  translations: Array<{
    detected_source_language: string;
    text: string;
  }>;
}

@Injectable()
export class DeepLService {
  private readonly logger = new Logger(DeepLService.name);
  private readonly apiKey: string;
  private readonly apiUrl = 'https://api-free.deepl.com/v2/translate';

  constructor() {
    this.apiKey = process.env.DEEPL_API_KEY || '';

    if (!this.apiKey) {
      this.logger.warn('DeepL API key not configured');
    }
  }

  /**
   * Translate text from source language to target language
   * @param text Text to translate
   * @param targetLang Target language code (e.g., 'FR' for French)
   * @param sourceLang Source language code (optional, auto-detect if not provided)
   * @returns Translated text
   */
  async translate(
    text: string,
    targetLang: string = 'FR',
    sourceLang?: string,
  ): Promise<string | null> {
    this.logger.debug(`DeepL translate called - text length: ${text?.length || 0}`);

    if (!this.apiKey) {
      this.logger.error('DeepL API key not configured, cannot translate');
      return null;
    }

    if (!text || text.trim().length === 0) {
      this.logger.warn('DeepL: Empty text provided, skipping translation');
      return null;
    }

    try {
      const params = new URLSearchParams({
        text: text,
        target_lang: targetLang,
      });

      if (sourceLang) {
        params.append('source_lang', sourceLang);
      }

      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `DeepL-Auth-Key ${this.apiKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(
          `DeepL API error: ${response.status} - ${errorText}`,
        );
        return null;
      }

      const data: DeepLTranslationResponse = await response.json();
      if (data.translations && data.translations.length > 0) {
        return data.translations[0].text;
      }

      this.logger.warn('DeepL: No translations in response');
      return null;
    } catch (error) {
      this.logger.error(
        `Error translating text with DeepL: ${error.message}`,
        error.stack,
      );
      return null;
    }
  }

  /**
   * Translate English text to French (convenience method)
   * @param text English text to translate
   * @returns French translation
   */
  async translateToFrench(text: string): Promise<string | null> {
    return this.translate(text, 'FR', 'EN');
  }

  /**
   * Check if DeepL service is configured and available
   * @returns true if API key is configured
   */
  isConfigured(): boolean {
    return !!this.apiKey;
  }
}
