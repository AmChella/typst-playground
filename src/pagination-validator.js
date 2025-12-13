/**
 * Pagination Validator Module
 * Validates PDF pagination rules for documents generated through Typst
 */

import * as pdfjsLib from "pdfjs-dist";

// =====================
// VALIDATION RULE TYPES
// =====================

/**
 * @typedef {Object} ValidationRule
 * @property {string} id - Unique rule identifier
 * @property {string} name - Human-readable rule name
 * @property {string} description - Rule description
 * @property {'error' | 'warning' | 'info'} severity - Severity level
 * @property {boolean} enabled - Whether rule is active
 * @property {Object} config - Rule-specific configuration
 */

/**
 * @typedef {Object} ValidationResult
 * @property {string} ruleId - The rule that generated this result
 * @property {string} ruleName - Human-readable rule name
 * @property {'pass' | 'fail' | 'warning' | 'info'} status - Result status
 * @property {'error' | 'warning' | 'info'} severity - Severity of the issue
 * @property {string} message - Detailed message
 * @property {number|null} page - Affected page number (if applicable)
 * @property {Object|null} details - Additional details
 */

/**
 * @typedef {Object} ValidationSummary
 * @property {boolean} valid - Overall validation status
 * @property {number} totalRules - Total rules checked
 * @property {number} passed - Number of passed rules
 * @property {number} failed - Number of failed rules
 * @property {number} warnings - Number of warnings
 * @property {ValidationResult[]} results - All validation results
 * @property {Object} metadata - PDF metadata
 */

// =====================
// DEFAULT VALIDATION RULES
// =====================

const DEFAULT_RULES = [
  {
    id: 'page-count-min',
    name: 'Minimum Page Count',
    description: 'Ensures document has at least the specified number of pages',
    severity: 'error',
    enabled: false,
    config: { minPages: 1 }
  },
  {
    id: 'page-count-max',
    name: 'Maximum Page Count',
    description: 'Ensures document does not exceed the specified number of pages',
    severity: 'error',
    enabled: true,
    config: { maxPages: 100 }
  },
  {
    id: 'page-size',
    name: 'Page Size Validation',
    description: 'Validates that all pages match the expected dimensions',
    severity: 'warning',
    enabled: true,
    config: {
      expectedSize: 'A4', // A4, Letter, Legal, or custom
      tolerance: 5, // points tolerance
      customWidth: null, // for custom size (in points)
      customHeight: null
    }
  },
  {
    id: 'page-size-consistency',
    name: 'Consistent Page Sizes',
    description: 'Ensures all pages have the same dimensions',
    severity: 'warning',
    enabled: true,
    config: { tolerance: 1 }
  },
  {
    id: 'near-empty-page',
    name: 'Near-Empty Page Detection',
    description: 'Detects pages with very little content',
    severity: 'warning',
    enabled: true,
    config: {
      minContentRatio: 0.05, // Minimum content fill ratio (5%)
      excludeFirstPage: false,
      excludeLastPage: true
    }
  },
  {
    id: 'blank-page',
    name: 'Blank Page Detection',
    description: 'Detects completely blank pages',
    severity: 'warning',
    enabled: true,
    config: {
      allowIntentionalBlanks: true // Allow if page contains "blank" text
    }
  },
  {
    id: 'page-number-sequence',
    name: 'Page Number Sequence',
    description: 'Validates page numbering is sequential',
    severity: 'info',
    enabled: false,
    config: {
      startNumber: 1,
      checkForGaps: true
    }
  },
  {
    id: 'content-overflow',
    name: 'Content Overflow Detection',
    description: 'Detects content that may overflow page boundaries',
    severity: 'warning',
    enabled: true,
    config: {
      marginThreshold: 20 // points from edge
    }
  },
  {
    id: 'orphan-widow',
    name: 'Orphan/Widow Detection',
    description: 'Detects single lines at page start/end (orphans/widows) in content area',
    severity: 'info',
    enabled: false,
    config: {
      minLinesTop: 2, // Minimum lines at page top for a paragraph
      minLinesBottom: 2, // Minimum lines at page bottom for a paragraph
      headerMargin: 72, // Points from top to exclude as header area (1 inch default)
      footerMargin: 72, // Points from bottom to exclude as footer area (1 inch default)
      lineGapThreshold: 24 // Points gap to consider lines as separate blocks
    }
  },
  {
    id: 'text-extraction',
    name: 'Text Extractability',
    description: 'Ensures text can be extracted from all pages',
    severity: 'info',
    enabled: true,
    config: {}
  }
];

// =====================
// PAGE SIZE DEFINITIONS (in points, 1 point = 1/72 inch)
// =====================

const PAGE_SIZES = {
  'A0': { width: 2384, height: 3370 },
  'A1': { width: 1684, height: 2384 },
  'A2': { width: 1191, height: 1684 },
  'A3': { width: 842, height: 1191 },
  'A4': { width: 595, height: 842 },
  'A5': { width: 420, height: 595 },
  'A6': { width: 298, height: 420 },
  'Letter': { width: 612, height: 792 },
  'Legal': { width: 612, height: 1008 },
  'Tabloid': { width: 792, height: 1224 },
  'Executive': { width: 522, height: 756 },
  'B4': { width: 729, height: 1032 },
  'B5': { width: 516, height: 729 },
};

// =====================
// PAGINATION VALIDATOR CLASS
// =====================

export class PaginationValidator {
  constructor(rules = null) {
    this.rules = rules || JSON.parse(JSON.stringify(DEFAULT_RULES));
    this.lastResults = null;
  }

  /**
   * Get all available rules
   * @returns {ValidationRule[]}
   */
  getRules() {
    return this.rules;
  }

  /**
   * Update a specific rule
   * @param {string} ruleId
   * @param {Partial<ValidationRule>} updates
   */
  updateRule(ruleId, updates) {
    const rule = this.rules.find(r => r.id === ruleId);
    if (rule) {
      Object.assign(rule, updates);
    }
  }

  /**
   * Enable or disable a rule
   * @param {string} ruleId
   * @param {boolean} enabled
   */
  setRuleEnabled(ruleId, enabled) {
    this.updateRule(ruleId, { enabled });
  }

  /**
   * Update rule configuration
   * @param {string} ruleId
   * @param {Object} config
   */
  setRuleConfig(ruleId, config) {
    const rule = this.rules.find(r => r.id === ruleId);
    if (rule) {
      rule.config = { ...rule.config, ...config };
    }
  }

  /**
   * Reset all rules to defaults
   */
  resetRules() {
    this.rules = JSON.parse(JSON.stringify(DEFAULT_RULES));
  }

  /**
   * Validate a PDF buffer
   * @param {Uint8Array} pdfBuffer - PDF data
   * @returns {Promise<ValidationSummary>}
   */
  async validate(pdfBuffer) {
    const results = [];
    let metadata = {};

    try {
      // Load PDF document
      const pdf = await pdfjsLib.getDocument({ data: pdfBuffer }).promise;

      // Extract metadata
      metadata = await this._extractMetadata(pdf);

      // Run enabled validation rules
      for (const rule of this.rules) {
        if (!rule.enabled) continue;

        try {
          const ruleResults = await this._runRule(rule, pdf, metadata);
          results.push(...ruleResults);
        } catch (e) {
          console.warn(`[Pagination Validator] Rule ${rule.id} failed:`, e);
          results.push({
            ruleId: rule.id,
            ruleName: rule.name,
            status: 'fail',
            severity: 'info',
            message: `Rule execution failed: ${e.message}`,
            page: null,
            details: { error: e.message }
          });
        }
      }

    } catch (e) {
      console.error('[Pagination Validator] PDF loading failed:', e);
      results.push({
        ruleId: 'pdf-load',
        ruleName: 'PDF Loading',
        status: 'fail',
        severity: 'error',
        message: `Failed to load PDF: ${e.message}`,
        page: null,
        details: { error: e.message }
      });
    }

    // Calculate summary
    const passed = results.filter(r => r.status === 'pass').length;
    const failed = results.filter(r => r.status === 'fail').length;
    const warnings = results.filter(r => r.status === 'warning').length;
    const hasErrors = results.some(r => r.status === 'fail' && r.severity === 'error');

    const summary = {
      valid: !hasErrors,
      totalRules: this.rules.filter(r => r.enabled).length,
      passed,
      failed,
      warnings,
      results,
      metadata
    };

    this.lastResults = summary;
    return summary;
  }

  /**
   * Extract PDF metadata
   * @private
   */
  async _extractMetadata(pdf) {
    const metadata = {
      pageCount: pdf.numPages,
      pages: []
    };

    // Get info about each page
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 1.0 });

      metadata.pages.push({
        number: i,
        width: viewport.width,
        height: viewport.height,
        rotation: viewport.rotation
      });
    }

    // Get document info
    try {
      const info = await pdf.getMetadata();
      metadata.info = info?.info || {};
    } catch (e) {
      metadata.info = {};
    }

    return metadata;
  }

  /**
   * Run a specific validation rule
   * @private
   */
  async _runRule(rule, pdf, metadata) {
    switch (rule.id) {
      case 'page-count-min':
        return this._validatePageCountMin(rule, metadata);
      case 'page-count-max':
        return this._validatePageCountMax(rule, metadata);
      case 'page-size':
        return this._validatePageSize(rule, metadata);
      case 'page-size-consistency':
        return this._validatePageSizeConsistency(rule, metadata);
      case 'near-empty-page':
        return await this._validateNearEmptyPages(rule, pdf, metadata);
      case 'blank-page':
        return await this._validateBlankPages(rule, pdf, metadata);
      case 'page-number-sequence':
        return await this._validatePageNumberSequence(rule, pdf, metadata);
      case 'content-overflow':
        return await this._validateContentOverflow(rule, pdf, metadata);
      case 'orphan-widow':
        return await this._validateOrphanWidow(rule, pdf, metadata);
      case 'text-extraction':
        return await this._validateTextExtraction(rule, pdf, metadata);
      default:
        return [];
    }
  }

  // =====================
  // VALIDATION RULE IMPLEMENTATIONS
  // =====================

  _validatePageCountMin(rule, metadata) {
    const { minPages } = rule.config;
    const pageCount = metadata.pageCount;

    if (pageCount < minPages) {
      return [{
        ruleId: rule.id,
        ruleName: rule.name,
        status: 'fail',
        severity: rule.severity,
        message: `Document has ${pageCount} page(s), but requires at least ${minPages}`,
        page: null,
        details: { actual: pageCount, required: minPages }
      }];
    }

    return [{
      ruleId: rule.id,
      ruleName: rule.name,
      status: 'pass',
      severity: rule.severity,
      message: `Page count (${pageCount}) meets minimum requirement (${minPages})`,
      page: null,
      details: { actual: pageCount, required: minPages }
    }];
  }

  _validatePageCountMax(rule, metadata) {
    const { maxPages } = rule.config;
    const pageCount = metadata.pageCount;

    if (pageCount > maxPages) {
      return [{
        ruleId: rule.id,
        ruleName: rule.name,
        status: 'fail',
        severity: rule.severity,
        message: `Document has ${pageCount} page(s), but maximum allowed is ${maxPages}`,
        page: null,
        details: { actual: pageCount, limit: maxPages }
      }];
    }

    return [{
      ruleId: rule.id,
      ruleName: rule.name,
      status: 'pass',
      severity: rule.severity,
      message: `Page count (${pageCount}) within limit (${maxPages})`,
      page: null,
      details: { actual: pageCount, limit: maxPages }
    }];
  }

  _validatePageSize(rule, metadata) {
    const { expectedSize, tolerance, customWidth, customHeight } = rule.config;
    const results = [];

    // Get expected dimensions
    let expected;
    if (expectedSize === 'custom' && customWidth && customHeight) {
      expected = { width: customWidth, height: customHeight };
    } else if (PAGE_SIZES[expectedSize]) {
      expected = PAGE_SIZES[expectedSize];
    } else {
      return [{
        ruleId: rule.id,
        ruleName: rule.name,
        status: 'warning',
        severity: 'info',
        message: `Unknown page size: ${expectedSize}`,
        page: null,
        details: { requestedSize: expectedSize }
      }];
    }

    for (const page of metadata.pages) {
      // Check both orientations (portrait and landscape)
      const matchesPortrait =
        Math.abs(page.width - expected.width) <= tolerance &&
        Math.abs(page.height - expected.height) <= tolerance;

      const matchesLandscape =
        Math.abs(page.width - expected.height) <= tolerance &&
        Math.abs(page.height - expected.width) <= tolerance;

      if (!matchesPortrait && !matchesLandscape) {
        results.push({
          ruleId: rule.id,
          ruleName: rule.name,
          status: 'fail',
          severity: rule.severity,
          message: `Page ${page.number} size (${Math.round(page.width)}×${Math.round(page.height)}) does not match ${expectedSize} (${expected.width}×${expected.height})`,
          page: page.number,
          details: {
            actual: { width: page.width, height: page.height },
            expected: expected,
            sizeName: expectedSize
          }
        });
      }
    }

    if (results.length === 0) {
      results.push({
        ruleId: rule.id,
        ruleName: rule.name,
        status: 'pass',
        severity: rule.severity,
        message: `All ${metadata.pageCount} page(s) match expected size (${expectedSize})`,
        page: null,
        details: { expected: expected, sizeName: expectedSize }
      });
    }

    return results;
  }

  _validatePageSizeConsistency(rule, metadata) {
    const { tolerance } = rule.config;
    const results = [];

    if (metadata.pages.length <= 1) {
      return [{
        ruleId: rule.id,
        ruleName: rule.name,
        status: 'pass',
        severity: rule.severity,
        message: 'Single page document - consistency check not applicable',
        page: null,
        details: {}
      }];
    }

    const firstPage = metadata.pages[0];
    const inconsistentPages = [];

    for (let i = 1; i < metadata.pages.length; i++) {
      const page = metadata.pages[i];
      if (
        Math.abs(page.width - firstPage.width) > tolerance ||
        Math.abs(page.height - firstPage.height) > tolerance
      ) {
        inconsistentPages.push({
          pageNum: page.number,
          width: page.width,
          height: page.height
        });
      }
    }

    if (inconsistentPages.length > 0) {
      for (const page of inconsistentPages) {
        results.push({
          ruleId: rule.id,
          ruleName: rule.name,
          status: 'warning',
          severity: rule.severity,
          message: `Page ${page.pageNum} has different dimensions (${Math.round(page.width)}×${Math.round(page.height)}) than page 1 (${Math.round(firstPage.width)}×${Math.round(firstPage.height)})`,
          page: page.pageNum,
          details: {
            pageSize: { width: page.width, height: page.height },
            referenceSize: { width: firstPage.width, height: firstPage.height }
          }
        });
      }
    } else {
      results.push({
        ruleId: rule.id,
        ruleName: rule.name,
        status: 'pass',
        severity: rule.severity,
        message: `All ${metadata.pageCount} pages have consistent dimensions`,
        page: null,
        details: { dimensions: { width: firstPage.width, height: firstPage.height } }
      });
    }

    return results;
  }

  async _validateNearEmptyPages(rule, pdf, metadata) {
    const { minContentRatio, excludeFirstPage, excludeLastPage } = rule.config;
    const results = [];

    for (let i = 1; i <= metadata.pageCount; i++) {
      // Skip excluded pages
      if (excludeFirstPage && i === 1) continue;
      if (excludeLastPage && i === metadata.pageCount) continue;

      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageInfo = metadata.pages[i - 1];

      // Estimate content coverage based on text items
      const pageArea = pageInfo.width * pageInfo.height;
      let textArea = 0;

      for (const item of textContent.items) {
        if (item.str && item.str.trim()) {
          // Rough estimate: character width * height
          const itemWidth = item.width || (item.str.length * 6); // ~6 points per char
          const itemHeight = item.height || 12; // ~12 point font
          textArea += itemWidth * itemHeight;
        }
      }

      const contentRatio = textArea / pageArea;

      if (contentRatio < minContentRatio && textContent.items.length > 0) {
        results.push({
          ruleId: rule.id,
          ruleName: rule.name,
          status: 'warning',
          severity: rule.severity,
          message: `Page ${i} appears to have very little content (${(contentRatio * 100).toFixed(1)}% filled)`,
          page: i,
          details: {
            contentRatio,
            textItems: textContent.items.length,
            threshold: minContentRatio
          }
        });
      }
    }

    if (results.length === 0) {
      results.push({
        ruleId: rule.id,
        ruleName: rule.name,
        status: 'pass',
        severity: rule.severity,
        message: 'No near-empty pages detected',
        page: null,
        details: { threshold: minContentRatio }
      });
    }

    return results;
  }

  async _validateBlankPages(rule, pdf, metadata) {
    const { allowIntentionalBlanks } = rule.config;
    const results = [];
    const blankPages = [];

    for (let i = 1; i <= metadata.pageCount; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();

      // Check if page is blank
      const hasText = textContent.items.some(item => item.str && item.str.trim());

      if (!hasText) {
        // Check for intentional blank page markers
        const fullText = textContent.items.map(i => i.str).join(' ').toLowerCase();
        const isIntentional = allowIntentionalBlanks &&
          (fullText.includes('blank') || fullText.includes('intentionally left'));

        if (!isIntentional) {
          blankPages.push(i);
        }
      }
    }

    if (blankPages.length > 0) {
      for (const pageNum of blankPages) {
        results.push({
          ruleId: rule.id,
          ruleName: rule.name,
          status: 'warning',
          severity: rule.severity,
          message: `Page ${pageNum} appears to be blank`,
          page: pageNum,
          details: {}
        });
      }
    } else {
      results.push({
        ruleId: rule.id,
        ruleName: rule.name,
        status: 'pass',
        severity: rule.severity,
        message: 'No unexpected blank pages detected',
        page: null,
        details: {}
      });
    }

    return results;
  }

  async _validatePageNumberSequence(rule, pdf, metadata) {
    const { startNumber, checkForGaps } = rule.config;
    const results = [];
    const pageNumbers = [];

    // Extract page numbers from text (usually in header/footer)
    for (let i = 1; i <= metadata.pageCount; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageInfo = metadata.pages[i - 1];

      // Look for page numbers in typical footer/header areas
      // (bottom 10% or top 10% of page)
      const topThreshold = pageInfo.height * 0.1;
      const bottomThreshold = pageInfo.height * 0.9;

      for (const item of textContent.items) {
        if (item.transform && item.str) {
          const y = item.transform[5]; // Y position
          const text = item.str.trim();

          // Check if in header/footer region and is a number
          if ((y > bottomThreshold || y < topThreshold) && /^\d+$/.test(text)) {
            const num = parseInt(text, 10);
            if (num > 0 && num <= metadata.pageCount * 2) { // Reasonable range
              pageNumbers.push({ physicalPage: i, number: num, y });
            }
          }
        }
      }
    }

    // Analyze sequence
    if (pageNumbers.length > 0) {
      const numbers = pageNumbers.map(p => p.number).sort((a, b) => a - b);

      if (checkForGaps) {
        for (let i = 1; i < numbers.length; i++) {
          if (numbers[i] - numbers[i - 1] > 1) {
            results.push({
              ruleId: rule.id,
              ruleName: rule.name,
              status: 'warning',
              severity: rule.severity,
              message: `Gap in page numbering: ${numbers[i - 1]} → ${numbers[i]}`,
              page: null,
              details: { before: numbers[i - 1], after: numbers[i] }
            });
          }
        }
      }

      // Check start number
      if (numbers[0] !== startNumber) {
        results.push({
          ruleId: rule.id,
          ruleName: rule.name,
          status: 'info',
          severity: 'info',
          message: `Page numbering starts at ${numbers[0]} instead of ${startNumber}`,
          page: null,
          details: { actual: numbers[0], expected: startNumber }
        });
      }
    } else {
      results.push({
        ruleId: rule.id,
        ruleName: rule.name,
        status: 'info',
        severity: 'info',
        message: 'No page numbers detected in header/footer areas',
        page: null,
        details: {}
      });
    }

    if (results.length === 0) {
      results.push({
        ruleId: rule.id,
        ruleName: rule.name,
        status: 'pass',
        severity: rule.severity,
        message: 'Page numbering sequence is correct',
        page: null,
        details: {}
      });
    }

    return results;
  }

  async _validateContentOverflow(rule, pdf, metadata) {
    const { marginThreshold } = rule.config;
    const results = [];
    const overflowPages = [];

    for (let i = 1; i <= metadata.pageCount; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageInfo = metadata.pages[i - 1];

      let hasOverflow = false;
      const overflowItems = [];

      for (const item of textContent.items) {
        if (item.transform && item.str && item.str.trim()) {
          const x = item.transform[4];
          const y = item.transform[5];
          const width = item.width || 0;
          const height = item.height || 12;

          // Check boundaries
          if (x < marginThreshold) {
            overflowItems.push({ type: 'left', x, y, text: item.str.substring(0, 20) });
            hasOverflow = true;
          }
          if (x + width > pageInfo.width - marginThreshold) {
            overflowItems.push({ type: 'right', x, y, text: item.str.substring(0, 20) });
            hasOverflow = true;
          }
          if (y < marginThreshold) {
            overflowItems.push({ type: 'bottom', x, y, text: item.str.substring(0, 20) });
            hasOverflow = true;
          }
          if (y + height > pageInfo.height - marginThreshold) {
            overflowItems.push({ type: 'top', x, y, text: item.str.substring(0, 20) });
            hasOverflow = true;
          }
        }
      }

      if (hasOverflow) {
        overflowPages.push({ page: i, items: overflowItems });
      }
    }

    if (overflowPages.length > 0) {
      for (const overflow of overflowPages) {
        const directions = [...new Set(overflow.items.map(i => i.type))];
        results.push({
          ruleId: rule.id,
          ruleName: rule.name,
          status: 'warning',
          severity: rule.severity,
          message: `Page ${overflow.page}: Content near ${directions.join(', ')} edge(s) (within ${marginThreshold}pt of boundary)`,
          page: overflow.page,
          details: {
            directions,
            itemCount: overflow.items.length,
            threshold: marginThreshold
          }
        });
      }
    } else {
      results.push({
        ruleId: rule.id,
        ruleName: rule.name,
        status: 'pass',
        severity: rule.severity,
        message: `All content within ${marginThreshold}pt margin threshold`,
        page: null,
        details: { threshold: marginThreshold }
      });
    }

    return results;
  }

  async _validateOrphanWidow(rule, pdf, metadata) {
    const {
      minLinesTop,
      minLinesBottom,
      headerMargin = 72,
      footerMargin = 72,
      lineGapThreshold = 24
    } = rule.config;
    const results = [];

    for (let i = 1; i <= metadata.pageCount; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageInfo = metadata.pages[i - 1];

      // Define content area boundaries (excluding header and footer)
      // PDF Y coordinates start from bottom, so:
      // - Footer area: Y < footerMargin
      // - Header area: Y > (pageHeight - headerMargin)
      // - Content area: footerMargin <= Y <= (pageHeight - headerMargin)
      const contentTopBoundary = pageInfo.height - headerMargin;
      const contentBottomBoundary = footerMargin;

      // Collect text items in content area only (excluding header/footer)
      const contentItems = [];
      for (const item of textContent.items) {
        if (item.transform && item.str && item.str.trim()) {
          const y = item.transform[5];
          // Only include items within the content area
          if (y >= contentBottomBoundary && y <= contentTopBoundary) {
            contentItems.push({
              text: item.str,
              y: y,
              x: item.transform[4],
              height: item.height || 12
            });
          }
        }
      }

      // Group content items by approximate line (Y position)
      const lineGroups = new Map();
      for (const item of contentItems) {
        // Round to approximate line height (~12pt)
        const lineY = Math.round(item.y / 12) * 12;
        if (!lineGroups.has(lineY)) {
          lineGroups.set(lineY, []);
        }
        lineGroups.get(lineY).push(item);
      }

      // Sort lines from top to bottom (highest Y first in PDF coordinates)
      const sortedYPositions = [...lineGroups.keys()].sort((a, b) => b - a);

      if (sortedYPositions.length < 3) continue; // Not enough content lines to check

      // Find paragraph boundaries by detecting larger gaps
      const lineGaps = [];
      for (let j = 0; j < sortedYPositions.length - 1; j++) {
        const gap = sortedYPositions[j] - sortedYPositions[j + 1];
        lineGaps.push({ index: j, gap });
      }

      // Average line gap (for normal line spacing)
      const avgLineGap = lineGaps.reduce((sum, g) => sum + g.gap, 0) / lineGaps.length;

      // Identify paragraph breaks (gaps significantly larger than average)
      const paragraphBreaks = lineGaps.filter(g => g.gap > avgLineGap * 1.5 || g.gap > lineGapThreshold);

      // Check for orphan at content area top
      // An orphan is a single line at the top that belongs to a paragraph from the previous page
      if (sortedYPositions.length > 1) {
        const topContentY = sortedYPositions[0];
        const secondLineY = sortedYPositions[1];
        const topGap = topContentY - secondLineY;

        // Check if there's a paragraph break after the first line
        const hasBreakAfterFirst = paragraphBreaks.some(b => b.index === 0);

        // If there's a significant gap after first line, it might be an orphan
        if (hasBreakAfterFirst || topGap > lineGapThreshold) {
          // Check if this first line is short (likely continuation from prev page)
          const firstLineItems = lineGroups.get(sortedYPositions[0]);
          const firstLineText = firstLineItems.map(it => it.text).join('');

          // Heuristic: orphan lines are usually short and don't start with heading markers
          const isLikelyOrphan = firstLineText.length < 80 &&
                                 !firstLineText.match(/^[=#\d]+[\.\)]/);

          if (isLikelyOrphan && i > 1) { // Can't have orphan on first page
            results.push({
              ruleId: rule.id,
              ruleName: rule.name,
              status: rule.severity === 'error' ? 'fail' : (rule.severity === 'warning' ? 'warning' : 'info'),
              severity: rule.severity,
              message: `Page ${i}: Potential orphan - single line "${firstLineText.substring(0, 30)}${firstLineText.length > 30 ? '...' : ''}" at content area top`,
              page: i,
              details: {
                type: 'orphan',
                gap: topGap,
                avgGap: avgLineGap,
                lineText: firstLineText.substring(0, 50),
                yPosition: topContentY
              }
            });
          }
        }
      }

      // Check for widow at content area bottom
      // A widow is a single line at the bottom that will continue to the next page
      if (sortedYPositions.length > 1 && i < metadata.pageCount) {
        const bottomContentY = sortedYPositions[sortedYPositions.length - 1];
        const secondBottomY = sortedYPositions[sortedYPositions.length - 2];
        const bottomGap = secondBottomY - bottomContentY;

        // Check if there's a paragraph break before the last line
        const hasBreakBeforeLast = paragraphBreaks.some(b => b.index === sortedYPositions.length - 2);

        if (hasBreakBeforeLast || bottomGap > lineGapThreshold) {
          const lastLineItems = lineGroups.get(sortedYPositions[sortedYPositions.length - 1]);
          const lastLineText = lastLineItems.map(it => it.text).join('');

          // Heuristic: widow lines are usually short and don't end sentences cleanly
          const isLikelyWidow = lastLineText.length < 80 &&
                                !lastLineText.match(/[.!?]$/);

          if (isLikelyWidow) {
            results.push({
              ruleId: rule.id,
              ruleName: rule.name,
              status: rule.severity === 'error' ? 'fail' : (rule.severity === 'warning' ? 'warning' : 'info'),
              severity: rule.severity,
              message: `Page ${i}: Potential widow - single line "${lastLineText.substring(0, 30)}${lastLineText.length > 30 ? '...' : ''}" at content area bottom`,
              page: i,
              details: {
                type: 'widow',
                gap: bottomGap,
                avgGap: avgLineGap,
                lineText: lastLineText.substring(0, 50),
                yPosition: bottomContentY
              }
            });
          }
        }
      }
    }

    if (results.length === 0) {
      results.push({
        ruleId: rule.id,
        ruleName: rule.name,
        status: 'pass',
        severity: rule.severity,
        message: 'No orphan/widow issues detected in content areas',
        page: null,
        details: {
          headerMargin,
          footerMargin,
          note: 'Header and footer areas were excluded from analysis'
        }
      });
    }

    return results;
  }

  async _validateTextExtraction(rule, pdf, metadata) {
    const results = [];
    const problemPages = [];

    for (let i = 1; i <= metadata.pageCount; i++) {
      try {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();

        // Check if text extraction succeeded
        if (!textContent || !textContent.items) {
          problemPages.push({ page: i, error: 'No text content returned' });
        }
      } catch (e) {
        problemPages.push({ page: i, error: e.message });
      }
    }

    if (problemPages.length > 0) {
      for (const problem of problemPages) {
        results.push({
          ruleId: rule.id,
          ruleName: rule.name,
          status: 'warning',
          severity: rule.severity,
          message: `Page ${problem.page}: Text extraction issue - ${problem.error}`,
          page: problem.page,
          details: { error: problem.error }
        });
      }
    } else {
      results.push({
        ruleId: rule.id,
        ruleName: rule.name,
        status: 'pass',
        severity: rule.severity,
        message: `Text can be extracted from all ${metadata.pageCount} page(s)`,
        page: null,
        details: {}
      });
    }

    return results;
  }
}

// =====================
// CONVENIENCE FUNCTIONS
// =====================

/**
 * Create a new validator with default rules
 * @returns {PaginationValidator}
 */
export function createValidator() {
  return new PaginationValidator();
}

/**
 * Quick validation with default settings
 * @param {Uint8Array} pdfBuffer
 * @returns {Promise<ValidationSummary>}
 */
export async function quickValidate(pdfBuffer) {
  const validator = new PaginationValidator();
  return validator.validate(pdfBuffer);
}

/**
 * Get list of available page sizes
 * @returns {string[]}
 */
export function getAvailablePageSizes() {
  return Object.keys(PAGE_SIZES);
}

/**
 * Get page size dimensions
 * @param {string} sizeName
 * @returns {{width: number, height: number} | null}
 */
export function getPageSizeDimensions(sizeName) {
  return PAGE_SIZES[sizeName] || null;
}

/**
 * Get default validation rules
 * @returns {ValidationRule[]}
 */
export function getDefaultRules() {
  return JSON.parse(JSON.stringify(DEFAULT_RULES));
}

// Export PAGE_SIZES for external use
export { PAGE_SIZES };

