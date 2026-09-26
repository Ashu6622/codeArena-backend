require('reflect-metadata');
const { Test } = require('@nestjs/testing');
const { ConfigService } = require('@nestjs/config');
const request = require('supertest');
const { ExecutionModule } = require('../dist/apps/api/src/execution/execution.module');
const { PrismaService } = require('../dist/apps/api/src/prisma/prisma.service');

describe('C++ Code Execution (/run)', () => {
  let app;
  const config = {
    getOrThrow: jest.fn((key) => {
      const values = {
        'execution.timeoutMs': 2000,
        'execution.memoryLimitMb': 64,
        'execution.maxOutputBytes': 1024,
      };
      if (!(key in values)) throw new Error('Unknown test config: ' + key);
      return values[key];
    }),
  };
  const prisma = {
    problem: { findFirst: jest.fn() },
  };
  const cppSampleProblem = {
    id: 'problem-id-cpp',
    title: 'Two Sum',
    slug: 'two-sum',
    timeLimitMs: 1000,
    memoryLimitMb: 128,
    languages: [
      {
        language: 'CPP',
        functionSignature: 'twoSum(nums: vector<int>, target: int): vector<int>',
      },
    ],
    testCases: [
      {
        id: 'sample-1',
        input: '{"nums":[2,7,11,15],"target":9}',
        expectedOutput: '[0,1]',
        order: 0,
      },
    ],
  };

  const correctCppCode = `#include <vector>
#include <unordered_map>
using namespace std;

class Solution {
public:
    vector<int> twoSum(vector<int>& nums, int target) {
        unordered_map<int, int> seen;
        for (int i = 0; i < (int)nums.size(); ++i) {
            int complement = target - nums[i];
            if (seen.count(complement)) {
                return {seen[complement], i};
            }
            seen[nums[i]] = i;
        }
        return {};
    }
};`;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [ExecutionModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(ConfigService)
      .useValue(config)
      .compile();
    app = module.createNestApplication();
    app.useLogger(false);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.problem.findFirst.mockResolvedValue(cppSampleProblem);
  });

  it('compiles and runs C++ code returning ACCEPTED on matching test cases', async () => {
    const response = await request(app.getHttpServer())
      .post('/run')
      .send({ problemSlug: 'two-sum', language: 'CPP', code: correctCppCode })
      .expect(201);

    expect(response.body).toMatchObject({
      problem: { id: 'problem-id-cpp', title: 'Two Sum', slug: 'two-sum', language: 'CPP' },
      verdict: 'ACCEPTED',
      passed: true,
      passedCount: 1,
      totalCount: 1,
    });
    expect(response.body.results[0]).toMatchObject({
      passed: true,
      verdict: 'ACCEPTED',
      actualOutput: '[0,1]',
    });
  });

  it('returns COMPILE_ERROR on C++ compilation failure', async () => {
    const response = await request(app.getHttpServer())
      .post('/run')
      .send({
        problemSlug: 'two-sum',
        language: 'CPP',
        code: 'class Solution { syntax error here };',
      })
      .expect(201);

    expect(response.body.verdict).toBe('COMPILE_ERROR');
    expect(response.body.results[0].error).toContain('error:');
  });

  it('returns WRONG_ANSWER when C++ solution produces incorrect output', async () => {
    const response = await request(app.getHttpServer())
      .post('/run')
      .send({
        problemSlug: 'two-sum',
        language: 'CPP',
        code: '#include <vector>\nusing namespace std;\nclass Solution { public: vector<int> twoSum(vector<int>& nums, int target) { return {0,0}; } };',
      })
      .expect(201);

    expect(response.body.verdict).toBe('WRONG_ANSWER');
    expect(response.body.passed).toBe(false);
  });
});
