import 'reflect-metadata';

import { Difficulty, Language, PrismaClient, Role } from '@prisma/client';
import { loadEnvFile } from 'node:process';
import { PasswordService } from '../apps/api/src/auth/password.service';

loadEnvFile('.env');

const prisma = new PrismaClient();
const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.SEED_ADMIN_PASSWORD;
const name = process.env.SEED_ADMIN_NAME?.trim() || 'CodeArena Admin';

if (!email || !email.includes('@')) {
  throw new Error('SEED_ADMIN_EMAIL must be a valid email address');
}
if (!password || password.length < 15 || password.length > 128) {
  throw new Error('SEED_ADMIN_PASSWORD must contain 15 to 128 characters');
}
const seedAdminEmail = email;
const seedAdminPassword = password;

const tags = [
  { name: 'Array', slug: 'array' },
  { name: 'String', slug: 'string' },
  { name: 'Hash Map', slug: 'hash-map' },
  { name: 'Binary Search', slug: 'binary-search' },
  { name: 'Stack', slug: 'stack' },
  { name: 'Sliding Window', slug: 'sliding-window' },
] as const;

const problems = [
  {
    title: 'Two Sum',
    slug: 'two-sum',
    description:
      'Given an array of integers nums and an integer target, return the indices of the two numbers whose values add up to target. Each input has exactly one solution, and the same element cannot be used twice.',
    difficulty: Difficulty.EASY,
    timeLimitMs: 1000,
    memoryLimitMb: 128,
    starterCode: `function twoSum(nums, target) {
  // Return the two matching indices.
}`,
    functionSignature: 'twoSum(nums: number[], target: number): number[]',
    tagSlugs: ['array', 'hash-map'],
    testCases: [
      {
        input: '{"nums":[2,7,11,15],"target":9}',
        expectedOutput: '[0,1]',
        isSample: true,
        order: 0,
      },
      { input: '{"nums":[3,2,4],"target":6}', expectedOutput: '[1,2]', isSample: true, order: 1 },
      { input: '{"nums":[3,3],"target":6}', expectedOutput: '[0,1]', isSample: false, order: 2 },
      {
        input: '{"nums":[-3,4,3,90],"target":0}',
        expectedOutput: '[0,2]',
        isSample: false,
        order: 3,
      },
    ],
  },
  {
    title: 'Valid Parentheses',
    slug: 'valid-parentheses',
    description:
      'Given a string containing only parentheses, square brackets, and braces, return true when every opening bracket is closed by the same type in the correct order. Otherwise return false.',
    difficulty: Difficulty.EASY,
    timeLimitMs: 1000,
    memoryLimitMb: 128,
    starterCode: `function isValid(s) {
  // Return true when the brackets are balanced.
}`,
    functionSignature: 'isValid(s: string): boolean',
    tagSlugs: ['string', 'stack'],
    testCases: [
      { input: '{"s":"()[]{}"}', expectedOutput: 'true', isSample: true, order: 0 },
      { input: '{"s":"(]"}', expectedOutput: 'false', isSample: true, order: 1 },
      { input: '{"s":"([)]"}', expectedOutput: 'false', isSample: false, order: 2 },
      { input: '{"s":"{[]}"}', expectedOutput: 'true', isSample: false, order: 3 },
    ],
  },
  {
    title: 'Binary Search',
    slug: 'binary-search',
    description:
      'Given a sorted array of unique integers and a target value, return the index of the target. Return -1 when it is absent. The solution must run in logarithmic time.',
    difficulty: Difficulty.EASY,
    timeLimitMs: 1000,
    memoryLimitMb: 128,
    starterCode: `function search(nums, target) {
  // Return the target index, or -1.
}`,
    functionSignature: 'search(nums: number[], target: number): number',
    tagSlugs: ['array', 'binary-search'],
    testCases: [
      {
        input: '{"nums":[-1,0,3,5,9,12],"target":9}',
        expectedOutput: '4',
        isSample: true,
        order: 0,
      },
      {
        input: '{"nums":[-1,0,3,5,9,12],"target":2}',
        expectedOutput: '-1',
        isSample: true,
        order: 1,
      },
      { input: '{"nums":[5],"target":5}', expectedOutput: '0', isSample: false, order: 2 },
      {
        input: '{"nums":[2,4,6,8,10],"target":10}',
        expectedOutput: '4',
        isSample: false,
        order: 3,
      },
    ],
  },
] as const;

async function main(): Promise<void> {
  const passwordHash = await new PasswordService().hash(seedAdminPassword);
  const admin = await prisma.user.upsert({
    where: { email: seedAdminEmail },
    update: { name, passwordHash, role: Role.ADMIN },
    create: { email: seedAdminEmail, name, passwordHash, role: Role.ADMIN },
    select: { id: true },
  });

  const savedTags = await Promise.all(
    tags.map((tag) =>
      prisma.tag.upsert({
        where: { slug: tag.slug },
        update: { name: tag.name },
        create: tag,
        select: { id: true, slug: true },
      }),
    ),
  );
  const tagIdsBySlug = new Map(savedTags.map((tag) => [tag.slug, tag.id]));

  for (const problem of problems) {
    await prisma.$transaction(async (transaction) => {
      const saved = await transaction.problem.upsert({
        where: { slug: problem.slug },
        update: {
          title: problem.title,
          description: problem.description,
          difficulty: problem.difficulty,
          timeLimitMs: problem.timeLimitMs,
          memoryLimitMb: problem.memoryLimitMb,
          isPublished: true,
          createdById: admin.id,
        },
        create: {
          title: problem.title,
          slug: problem.slug,
          description: problem.description,
          difficulty: problem.difficulty,
          timeLimitMs: problem.timeLimitMs,
          memoryLimitMb: problem.memoryLimitMb,
          isPublished: true,
          createdById: admin.id,
        },
        select: { id: true },
      });

      await transaction.problemLanguage.deleteMany({ where: { problemId: saved.id } });
      await transaction.testCase.deleteMany({ where: { problemId: saved.id } });
      await transaction.problemTag.deleteMany({ where: { problemId: saved.id } });
      await transaction.problemLanguage.create({
        data: {
          problemId: saved.id,
          language: Language.JAVASCRIPT,
          starterCode: problem.starterCode,
          functionSignature: problem.functionSignature,
        },
      });
      await transaction.testCase.createMany({
        data: problem.testCases.map((testCase) => ({ problemId: saved.id, ...testCase })),
      });
      await transaction.problemTag.createMany({
        data: problem.tagSlugs.map((slug) => ({
          problemId: saved.id,
          tagId: tagIdsBySlug.get(slug)!,
        })),
      });
    });
  }

  console.log(
    `Seed complete: 1 admin, ${tags.length} tags, and ${problems.length} published problems.`,
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
