import { describe, it, expect } from 'vitest';
import { ValidationRouter } from '../../cli/validation-router.js';

describe('ValidationRouter', () => {
  describe('Epic Validation Routing', () => {
    it('should include universal validators for all epics', () => {
      const router = new ValidationRouter();
      const epic = {
        name: 'Test Epic',
        domain: 'infrastructure',
        features: []
      };

      const validators = router.getValidatorsForEpic(epic);

      expect(validators).toContain('validator-epic-solution-architect');
      expect(validators).toContain('validator-epic-developer');
      expect(validators).toContain('validator-epic-security');
    });

    it('should add domain-specific validators for infrastructure domain', () => {
      const router = new ValidationRouter();
      const epic = {
        name: 'Foundation Services',
        domain: 'infrastructure',
        features: []
      };

      const validators = router.getValidatorsForEpic(epic);

      expect(validators).toContain('validator-epic-devops');
      expect(validators).toContain('validator-epic-cloud');
      expect(validators).toContain('validator-epic-backend');
    });

    it('should add domain-specific validators for user-management domain', () => {
      const router = new ValidationRouter();
      const epic = {
        name: 'User Authentication',
        domain: 'user-management',
        features: []
      };

      const validators = router.getValidatorsForEpic(epic);

      expect(validators).toContain('validator-epic-backend');
      expect(validators).toContain('validator-epic-database');
      expect(validators).toContain('validator-epic-security');
      expect(validators).toContain('validator-epic-api');
    });

    it('should add domain-specific validators for frontend domain', () => {
      const router = new ValidationRouter();
      const epic = {
        name: 'User Dashboard',
        domain: 'frontend',
        features: []
      };

      const validators = router.getValidatorsForEpic(epic);

      expect(validators).toContain('validator-epic-frontend');
      expect(validators).toContain('validator-epic-ui');
      expect(validators).toContain('validator-epic-ux');
    });

    it('should add feature-specific validators for authentication feature', () => {
      const router = new ValidationRouter();
      const epic = {
        name: 'User Auth',
        domain: 'infrastructure',
        features: ['authentication']
      };

      const validators = router.getValidatorsForEpic(epic);

      // Universal + domain + feature
      expect(validators).toContain('validator-epic-security'); // Already in universal, but feature adds it too
      expect(validators.filter(v => v === 'validator-epic-security').length).toBe(1); // Should not duplicate
    });

    it('should add feature-specific validators for database feature', () => {
      const router = new ValidationRouter();
      const epic = {
        name: 'Data Storage',
        domain: 'infrastructure',
        features: ['database']
      };

      const validators = router.getValidatorsForEpic(epic);

      expect(validators).toContain('validator-epic-database');
    });

    it('should add feature-specific validators for testing feature', () => {
      const router = new ValidationRouter();
      const epic = {
        name: 'Test Infrastructure',
        domain: 'infrastructure',
        features: ['testing']
      };

      const validators = router.getValidatorsForEpic(epic);

      expect(validators).toContain('validator-epic-qa');
      expect(validators).toContain('validator-epic-test-architect');
    });

    it('should combine multiple feature validators', () => {
      const router = new ValidationRouter();
      const epic = {
        name: 'Complete System',
        domain: 'infrastructure',
        features: ['authentication', 'database', 'testing', 'deployment']
      };

      const validators = router.getValidatorsForEpic(epic);

      // Universal
      expect(validators).toContain('validator-epic-solution-architect');
      expect(validators).toContain('validator-epic-developer');
      expect(validators).toContain('validator-epic-security');

      // Domain
      expect(validators).toContain('validator-epic-devops');
      expect(validators).toContain('validator-epic-cloud');
      expect(validators).toContain('validator-epic-backend');

      // Features
      expect(validators).toContain('validator-epic-database');
      expect(validators).toContain('validator-epic-qa');
      expect(validators).toContain('validator-epic-test-architect');

      // Should not have duplicates
      const uniqueValidators = new Set(validators);
      expect(validators.length).toBe(uniqueValidators.size);
    });

    it('should return unique validators (no duplicates)', () => {
      const router = new ValidationRouter();
      const epic = {
        name: 'Security System',
        domain: 'user-management',
        features: ['authentication', 'authorization', 'security']
      };

      const validators = router.getValidatorsForEpic(epic);

      // security validator appears in: universal, domain (user-management), and features (auth, authz, security)
      const securityCount = validators.filter(v => v === 'validator-epic-security').length;
      expect(securityCount).toBe(1); // Should only appear once
    });

    it('should handle unknown domain gracefully', () => {
      const router = new ValidationRouter();
      const epic = {
        name: 'Unknown Epic',
        domain: 'unknown-domain',
        features: []
      };

      const validators = router.getValidatorsForEpic(epic);

      // Should still have universal validators
      expect(validators).toContain('validator-epic-solution-architect');
      expect(validators).toContain('validator-epic-developer');
      expect(validators).toContain('validator-epic-security');
      expect(validators.length).toBeGreaterThanOrEqual(3);
    });

    it('should handle missing features array', () => {
      const router = new ValidationRouter();
      const epic = {
        name: 'Simple Epic',
        domain: 'frontend'
      };

      const validators = router.getValidatorsForEpic(epic);

      // Should still work without features
      expect(validators.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Story Validation Routing', () => {
    it('should include universal validators for all stories', () => {
      const router = new ValidationRouter();
      const story = {
        name: 'Test Story',
        acceptance: []
      };
      const epic = {
        domain: 'infrastructure',
        features: []
      };

      const validators = router.getValidatorsForStory(story, epic);

      expect(validators).toContain('validator-story-developer');
      expect(validators).toContain('validator-story-qa');
      expect(validators).toContain('validator-story-test-architect');
    });

    it('should inherit domain validators from parent epic', () => {
      const router = new ValidationRouter();
      const story = {
        name: 'User Login',
        acceptance: []
      };
      const epic = {
        domain: 'user-management',
        features: []
      };

      const validators = router.getValidatorsForStory(story, epic);

      expect(validators).toContain('validator-story-backend');
      expect(validators).toContain('validator-story-database');
      expect(validators).toContain('validator-story-security');
      expect(validators).toContain('validator-story-api');
      expect(validators).toContain('validator-story-ux');
    });

    it('should inherit feature validators from parent epic', () => {
      const router = new ValidationRouter();
      const story = {
        name: 'Password Reset',
        acceptance: []
      };
      const epic = {
        domain: 'user-management',
        features: ['authentication']
      };

      const validators = router.getValidatorsForStory(story, epic);

      expect(validators).toContain('validator-story-security'); // From authentication feature
    });

    it('should infer authentication feature from acceptance criteria', () => {
      const router = new ValidationRouter();
      const story = {
        name: 'User Login',
        acceptance: [
          'User can login with email and password',
          'User sees error for invalid credentials'
        ]
      };
      const epic = {
        domain: 'frontend',
        features: []
      };

      const validators = router.getValidatorsForStory(story, epic);

      expect(validators).toContain('validator-story-security');
    });

    it('should infer CRUD feature from acceptance criteria', () => {
      const router = new ValidationRouter();
      const story = {
        name: 'Manage Users',
        acceptance: [
          'Admin can create new users',
          'Admin can update user details',
          'Admin can delete users'
        ]
      };
      const epic = {
        domain: 'api',
        features: []
      };

      const validators = router.getValidatorsForStory(story, epic);

      expect(validators).toContain('validator-story-database');
      expect(validators).toContain('validator-story-api');
    });

    it('should infer search feature from acceptance criteria', () => {
      const router = new ValidationRouter();
      const story = {
        name: 'Find Users',
        acceptance: [
          'User can search by name',
          'User can filter by role'
        ]
      };
      const epic = {
        domain: 'frontend',
        features: []
      };

      const validators = router.getValidatorsForStory(story, epic);

      expect(validators).toContain('validator-story-database');
      expect(validators).toContain('validator-story-backend');
    });

    it('should infer real-time feature from acceptance criteria', () => {
      const router = new ValidationRouter();
      const story = {
        name: 'Live Updates',
        acceptance: [
          'User sees real-time notifications',
          'WebSocket connection is maintained'
        ]
      };
      const epic = {
        domain: 'frontend',
        features: []
      };

      const validators = router.getValidatorsForStory(story, epic);

      expect(validators).toContain('validator-story-api');
      expect(validators).toContain('validator-story-backend');
    });

    it('should infer responsive design feature from acceptance criteria', () => {
      const router = new ValidationRouter();
      const story = {
        name: 'Mobile Dashboard',
        acceptance: [
          'Dashboard is responsive on mobile devices',
          'Layout adapts to tablet screen sizes'
        ]
      };
      const epic = {
        domain: 'frontend',
        features: []
      };

      const validators = router.getValidatorsForStory(story, epic);

      expect(validators).toContain('validator-story-ui');
      expect(validators).toContain('validator-story-frontend');
    });

    it('should infer file upload feature from acceptance criteria', () => {
      const router = new ValidationRouter();
      const story = {
        name: 'Upload Documents',
        acceptance: [
          'User can upload PDF files',
          'File size is validated'
        ]
      };
      const epic = {
        domain: 'api',
        features: []
      };

      const validators = router.getValidatorsForStory(story, epic);

      expect(validators).toContain('validator-story-backend');
      expect(validators).toContain('validator-story-api');
    });

    it('should infer notification feature from acceptance criteria', () => {
      const router = new ValidationRouter();
      const story = {
        name: 'Email Notifications',
        acceptance: [
          'User receives email notification on signup',
          'User can configure notification preferences'
        ]
      };
      const epic = {
        domain: 'backend',
        features: []
      };

      const validators = router.getValidatorsForStory(story, epic);

      expect(validators).toContain('validator-story-backend');
      expect(validators).toContain('validator-story-api');
    });

    it('should combine epic features and inferred features', () => {
      const router = new ValidationRouter();
      const story = {
        name: 'Secure File Upload',
        acceptance: [
          'User can upload files with authentication',
          'Files are scanned for malware'
        ]
      };
      const epic = {
        domain: 'api',
        features: ['authentication']
      };

      const validators = router.getValidatorsForStory(story, epic);

      // Universal
      expect(validators).toContain('validator-story-developer');
      expect(validators).toContain('validator-story-qa');
      expect(validators).toContain('validator-story-test-architect');

      // Domain (api)
      expect(validators).toContain('validator-story-api');
      expect(validators).toContain('validator-story-backend');
      expect(validators).toContain('validator-story-security');

      // Epic feature (authentication)
      // Already covered by security from domain

      // Inferred features (file upload, authentication)
      // Already covered
    });

    it('should return unique validators (no duplicates)', () => {
      const router = new ValidationRouter();
      const story = {
        name: 'Complex Story',
        acceptance: [
          'User can login',
          'User can create items',
          'User can search items'
        ]
      };
      const epic = {
        domain: 'user-management',
        features: ['authentication', 'database']
      };

      const validators = router.getValidatorsForStory(story, epic);

      // Should not have duplicates
      const uniqueValidators = new Set(validators);
      expect(validators.length).toBe(uniqueValidators.size);
    });

    it('should handle missing acceptance criteria', () => {
      const router = new ValidationRouter();
      const story = {
        name: 'Story Without Acceptance'
      };
      const epic = {
        domain: 'frontend',
        features: []
      };

      const validators = router.getValidatorsForStory(story, epic);

      // Should still have universal validators
      expect(validators.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Feature Inference', () => {
    it('should infer multiple features from complex acceptance criteria', () => {
      const router = new ValidationRouter();

      const features = router.inferFeaturesFromAcceptance([
        'User can login with email and password',
        'User can create, update, and delete posts',
        'User can search for posts by keyword',
        'User receives real-time notifications',
        'Interface is responsive on mobile and tablet',
        'User can upload profile photo',
        'User sees analytics dashboard with reports'
      ]);

      expect(features).toContain('authentication');
      expect(features).toContain('crud-operations');
      expect(features).toContain('search');
      expect(features).toContain('real-time');
      expect(features).toContain('responsive-design');
      expect(features).toContain('file-upload');
      expect(features).toContain('reporting');
    });

    it('should handle case-insensitive matching', () => {
      const router = new ValidationRouter();

      const features = router.inferFeaturesFromAcceptance([
        'User can LOGIN with credentials',
        'User can SEARCH for items',
        'WEBSOCKET connection is established'
      ]);

      expect(features).toContain('authentication');
      expect(features).toContain('search');
      expect(features).toContain('real-time');
    });

    it('should handle empty acceptance criteria', () => {
      const router = new ValidationRouter();

      const features = router.inferFeaturesFromAcceptance([]);

      expect(features).toEqual([]);
    });

    it('should handle null/undefined acceptance criteria', () => {
      const router = new ValidationRouter();

      const features = router.inferFeaturesFromAcceptance(null);

      expect(features).toEqual([]);
    });
  });
});
