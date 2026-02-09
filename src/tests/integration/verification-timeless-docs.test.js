import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LLMVerifier } from '../../cli/llm-verifier.js';
import { mockClaudeProvider } from '../helpers/mock-providers.js';

describe('Timeless Documentation Verification', () => {
  let verifier;
  let provider;

  beforeEach(() => {
    provider = mockClaudeProvider({ shouldSucceed: true });
    verifier = new LLMVerifier(provider, 'project-documentation-creator');
  });

  describe('Rule Loading', () => {
    it('should load remove-status-and-timeline-references rule', () => {
      const rules = verifier.getRules();
      const statusRule = rules.find(r => r.id === 'remove-status-and-timeline-references');

      expect(statusRule).toBeDefined();
      expect(statusRule.severity).toBe('critical');
      expect(statusRule.enabled).toBe(true);
    });

    it('should load enforce-present-tense rule', () => {
      const rules = verifier.getRules();
      const tenseRule = rules.find(r => r.id === 'enforce-present-tense');

      expect(tenseRule).toBeDefined();
      expect(tenseRule.severity).toBe('major');
      expect(tenseRule.enabled).toBe(true);
    });

    it('should have fastPath disabled for content rules', () => {
      const rules = verifier.getRules();
      const statusRule = rules.find(r => r.id === 'remove-status-and-timeline-references');
      const tenseRule = rules.find(r => r.id === 'enforce-present-tense');

      // Access the full rule object to check fastPath
      const fullStatusRule = verifier.rules.find(r => r.id === 'remove-status-and-timeline-references');
      const fullTenseRule = verifier.rules.find(r => r.id === 'enforce-present-tense');

      expect(fullStatusRule.fastPath?.enabled).toBe(false);
      expect(fullTenseRule.fastPath?.enabled).toBe(false);
    });
  });

  describe('Status Fields Removal', () => {
    it('should remove "Status: Planned" lines', async () => {
      const input = `
## 3. Core Features

Status: Planned

The system provides authentication.
`;

      // Create a custom mock that returns different values for each call
      let callCount = 0;
      provider.generate = vi.fn().mockImplementation(() => {
        callCount++;
        // First 10 calls are for checking each of the 10 rules (most return 'NO')
        if (callCount === 1) return Promise.resolve('YES'); // remove-status-and-timeline-references check
        if (callCount <= 10) return Promise.resolve('NO'); // Other rules check
        // Call 11 is the fix for remove-status-and-timeline-references
        if (callCount === 11) return Promise.resolve(`
## 3. Core Features

The system provides authentication.
`);
        return Promise.resolve('NO');
      });

      const result = await verifier.verify(input);

      expect(result.content).not.toContain('Status: Planned');
      expect(result.content).toContain('The system provides authentication');
    });

    it('should remove "Status: Initial Definition"', async () => {
      const input = `
### Feature

Status: Initial Definition

Authentication feature description.
`;

      // Create a custom mock that returns different values for each call
      let callCount = 0;
      provider.generate = vi.fn().mockImplementation(() => {
        callCount++;
        // First 10 calls are for checking each of the 10 rules (most return 'NO')
        if (callCount === 1) return Promise.resolve('YES'); // remove-status-and-timeline-references check
        if (callCount <= 10) return Promise.resolve('NO'); // Other rules check
        // Call 11 is the fix for remove-status-and-timeline-references
        if (callCount === 11) return Promise.resolve(`
### Feature

Authentication feature description.
`);
        return Promise.resolve('NO');
      });

      const result = await verifier.verify(input);

      expect(result.content).not.toContain('Status: Initial Definition');
      expect(result.content).toContain('Authentication feature description');
    });
  });

  describe('Timeline References Removal', () => {
    it('should remove Phase references', async () => {
      const input = `
## 3. Core Features

### Authentication (Phase 1)
Users authenticate using email.

### OAuth (Phase 2)
Social login support.
`;

      let callCount = 0;
      provider.generate = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve('YES');
        if (callCount <= 10) return Promise.resolve('NO');
        if (callCount === 11) return Promise.resolve(`
## 3. Core Features

### Authentication
Users authenticate using email.

### OAuth
Social login support.
`);
        return Promise.resolve('NO');
      });

      const result = await verifier.verify(input);

      expect(result.content).not.toContain('Phase 1');
      expect(result.content).not.toContain('Phase 2');
      expect(result.content).toContain('Users authenticate using email');
    });

    it('should remove version references', async () => {
      const input = `
## 3. Core Features

### Basic Features (MVP)
Core functionality included in v1.0.

### Advanced Features (v2.0)
Planned for Q2 2026 release.
`;

      let callCount = 0;
      provider.generate = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve('YES');
        if (callCount <= 10) return Promise.resolve('NO');
        if (callCount === 11) return Promise.resolve(`
## 3. Core Features

### Basic Features
Core functionality.

### Advanced Features
Advanced capabilities.
`);
        return Promise.resolve('NO');
      });

      const result = await verifier.verify(input);

      expect(result.content).not.toContain('MVP');
      expect(result.content).not.toContain('v1.0');
      expect(result.content).not.toContain('v2.0');
      expect(result.content).not.toContain('Q2 2026');
    });

    it('should remove milestone and sprint references', async () => {
      const input = `Feature scheduled for Sprint 3, Milestone 2.`;

      let callCount = 0;
      provider.generate = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve('YES');
        if (callCount <= 10) return Promise.resolve('NO');
        if (callCount === 11) return Promise.resolve('Feature provides functionality.');
        return Promise.resolve('NO');
      });

      const result = await verifier.verify(input);

      expect(result.content).not.toContain('Sprint 3');
      expect(result.content).not.toContain('Milestone 2');
    });
  });

  describe('Future Tense Conversion', () => {
    it('should convert "will provide" to "provides"', async () => {
      const input = 'The API will provide RESTful endpoints.';

      let callCount = 0;
      provider.generate = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve('YES');
        if (callCount <= 10) return Promise.resolve('NO');
        if (callCount === 11) return Promise.resolve('The API provides RESTful endpoints.');
        return Promise.resolve('NO');
      });

      const result = await verifier.verify(input);

      expect(result.content).not.toContain('will provide');
      expect(result.content).toContain('provides');
    });

    it('should convert multiple future tense patterns', async () => {
      const input = `
The system will include authentication.
Users will be able to login.
The database will store encrypted data.
`;

      let callCount = 0;
      provider.generate = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve('YES');
        if (callCount <= 10) return Promise.resolve('NO');
        if (callCount === 11) return Promise.resolve(`
The system includes authentication.
Users login.
The database stores encrypted data.
`);
        return Promise.resolve('NO');
      });

      const result = await verifier.verify(input);

      expect(result.content).not.toContain('will include');
      expect(result.content).not.toContain('will be able to');
      expect(result.content).not.toContain('will store');
      expect(result.content).toContain('includes');
      expect(result.content).toContain('login');
      expect(result.content).toContain('stores');
    });

    it('should convert "is going to" patterns', async () => {
      const input = 'The system is going to handle 10,000 users.';

      let callCount = 0;
      provider.generate = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve('YES');
        if (callCount <= 10) return Promise.resolve('NO');
        if (callCount === 11) return Promise.resolve('The system handles 10,000 users.');
        return Promise.resolve('NO');
      });

      const result = await verifier.verify(input);

      expect(result.content).not.toContain('is going to');
      expect(result.content).toContain('handles');
    });
  });

  describe('Planning Language Removal', () => {
    it('should remove "planned for" phrases', async () => {
      const input = 'Authentication is planned for the next sprint.';

      let callCount = 0;
      provider.generate = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve('YES');
        if (callCount <= 10) return Promise.resolve('NO');
        if (callCount === 11) return Promise.resolve('Authentication provides secure access.');
        return Promise.resolve('NO');
      });

      const result = await verifier.verify(input);

      expect(result.content).not.toContain('planned for');
      expect(result.content).not.toContain('sprint');
    });

    it('should remove conditional temporal language', async () => {
      const input = 'Once deployed, users will access the dashboard.';

      let callCount = 0;
      provider.generate = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve('YES');
        if (callCount <= 10) return Promise.resolve('NO');
        if (callCount === 11) return Promise.resolve('Users access the dashboard.');
        return Promise.resolve('NO');
      });

      const result = await verifier.verify(input);

      expect(result.content).not.toContain('Once deployed');
      expect(result.content).toContain('Users access the dashboard');
    });

    it('should remove "to be implemented" phrases', async () => {
      const input = 'The feature is to be implemented next quarter.';

      let callCount = 0;
      provider.generate = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve('YES');
        if (callCount <= 10) return Promise.resolve('NO');
        if (callCount === 11) return Promise.resolve('The feature provides functionality.');
        return Promise.resolve('NO');
      });

      const result = await verifier.verify(input);

      expect(result.content).not.toContain('to be implemented');
      expect(result.content).not.toContain('quarter');
    });
  });

  describe('Temporal Sequencing Removal', () => {
    it('should remove "initially" and "eventually"', async () => {
      const input = 'Initially, the system includes basic features. Eventually, advanced analytics will be added.';

      let callCount = 0;
      provider.generate = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve('YES');
        if (callCount <= 10) return Promise.resolve('NO');
        if (callCount === 11) return Promise.resolve('The system includes basic features and advanced analytics.');
        return Promise.resolve('NO');
      });

      const result = await verifier.verify(input);

      expect(result.content).not.toContain('Initially');
      expect(result.content).not.toContain('Eventually');
      expect(result.content).not.toContain('will be added');
    });

    it('should remove "first, then" sequencing', async () => {
      const input = 'First, users authenticate, then they access the dashboard.';

      let callCount = 0;
      provider.generate = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve('YES');
        if (callCount <= 10) return Promise.resolve('NO');
        if (callCount === 11) return Promise.resolve('Users authenticate and access the dashboard.');
        return Promise.resolve('NO');
      });

      const result = await verifier.verify(input);

      expect(result.content).not.toContain('First,');
      expect(result.content).not.toContain(' then ');
    });
  });

  describe('Preserve Legitimate Uses', () => {
    it('should preserve technical "phase" references', async () => {
      const input = 'The database uses two-phase commit protocol.';

      // Mock all 10 rule checks to return 'NO'
      provider.generate = vi.fn().mockResolvedValue('NO');

      const result = await verifier.verify(input);

      expect(result.content).toContain('two-phase commit');
    });

    it('should preserve "planned" in legitimate context', async () => {
      const input = 'The architecture follows a well-planned design.';

      // Mock all 10 rule checks to return 'NO'
      provider.generate = vi.fn().mockResolvedValue('NO');

      const result = await verifier.verify(input);

      expect(result.content).toContain('well-planned design');
    });

    it('should preserve API version references', async () => {
      const input = 'The API uses version 2.0 of the protocol.';

      // Mock all 10 rule checks to return 'NO'
      provider.generate = vi.fn().mockResolvedValue('NO');

      const result = await verifier.verify(input);

      expect(result.content).toContain('version 2.0');
    });

    it('should preserve present tense content', async () => {
      const input = `
The system provides authentication.
Users authenticate using OAuth 2.0.
The API includes RESTful endpoints.
`;

      // Mock all 10 rule checks to return 'NO'
      provider.generate = vi.fn().mockResolvedValue('NO');

      const result = await verifier.verify(input);

      expect(result.content).toContain('provides authentication');
      expect(result.content).toContain('authenticate using');
      expect(result.content).toContain('includes RESTful');
    });
  });

  describe('Combined Violations', () => {
    it('should fix multiple issues in one document', async () => {
      const input = `
## Project Overview

Status: Planned

The system will provide authentication in Phase 1.

### Features (MVP)

Initially, users will be able to login. Eventually, we will add OAuth support planned for Q2 2026.
`;

      let callCount = 0;
      provider.generate = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve('YES');
        if (callCount <= 10) return Promise.resolve('NO');
        if (callCount === 11) return Promise.resolve(`
## Project Overview

The system provides authentication.

### Features

Users login. The system supports OAuth.
`);
        return Promise.resolve('NO');
      });

      const result = await verifier.verify(input);

      // Verify all violations removed
      expect(result.content).not.toContain('Status: Planned');
      expect(result.content).not.toContain('will provide');
      expect(result.content).not.toContain('Phase 1');
      expect(result.content).not.toContain('MVP');
      expect(result.content).not.toContain('Initially');
      expect(result.content).not.toContain('will be able to');
      expect(result.content).not.toContain('Eventually');
      expect(result.content).not.toContain('we will add');
      expect(result.content).not.toContain('planned for');
      expect(result.content).not.toContain('Q2 2026');

      // Verify content preserved in present tense
      expect(result.content).toContain('provides authentication');
      expect(result.content).toContain('login');
      expect(result.content).toContain('OAuth');
    });
  });
});
