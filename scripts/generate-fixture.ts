import { generateHauntedFixture } from '../src/fixture/generate.js';

console.log('Generating Haunted Showcase Fixture...');
const dir = generateHauntedFixture();
console.log(`Successfully created Haunted Showcase Repo at: ${dir}`);
