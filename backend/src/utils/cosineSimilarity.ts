/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error('Vectors must have the same length');
  }

  if (vecA.length === 0) {
    throw new Error('Vectors cannot be empty');
  }

  // Calculate dot product
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);

  if (normA === 0 || normB === 0) {
    return 0; // Handle zero vectors
  }

  return dotProduct / (normA * normB);
}

/**
 * Find the most similar vectors from a collection
 */
export function findMostSimilar(
  queryVector: number[],
  vectorCollection: Array<{ id: string; vector: number[]; metadata?: any }>,
  topK: number = 5,
  threshold: number = 0
): Array<{ id: string; similarity: number; metadata?: any }> {
  const similarities = vectorCollection
    .map(item => ({
      id: item.id,
      similarity: cosineSimilarity(queryVector, item.vector),
      metadata: item.metadata
    }))
    .filter(item => item.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);

  return similarities;
}

/**
 * Calculate average similarity between a vector and a collection
 */
export function averageSimilarity(
  vector: number[],
  collection: number[][]
): number {
  if (collection.length === 0) {
    return 0;
  }

  const totalSimilarity = collection.reduce(
    (sum, vec) => sum + cosineSimilarity(vector, vec),
    0
  );

  return totalSimilarity / collection.length;
}

/**
 * Normalize a vector to unit length
 */
export function normalizeVector(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  
  if (magnitude === 0) {
    return vector;
  }

  return vector.map(val => val / magnitude);
} 