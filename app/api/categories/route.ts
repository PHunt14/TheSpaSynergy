/**
 * Categories API
 *
 * GET  /api/categories — Returns all service categories from the ServiceCategory table
 * POST /api/categories — Creates a new category (admin only)
 * DELETE /api/categories?categoryId=xxx — Deletes a category (admin only)
 */

import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../../amplify/data/resource';
import config from '../../../amplify_outputs.json';
import { validateCategoryName } from '../../utils/categoryValidator';

Amplify.configure(config, { ssr: true });

function getClient() {
  return generateClient<Schema>();
}

export async function GET() {
  const client = getClient();

  try {
    const categories: Array<{ categoryId: string; name: string; createdAt?: string }> = [];
    let nextToken: string | null = null;

    do {
      const result = await client.models.ServiceCategory.list({
        ...(nextToken ? { nextToken } : {}),
      } as any);

      if (result.data) {
        for (const cat of result.data) {
          categories.push({
            categoryId: cat.categoryId,
            name: cat.name,
            createdAt: cat.createdAt || undefined,
          });
        }
      }
      nextToken = (result as any).nextToken;
    } while (nextToken);

    // If ServiceCategory table is empty, fall back to extracting from services
    if (categories.length === 0) {
      const { data: services } = await client.models.Service.list() as any;
      const catSet = new Set<string>();
      for (const svc of (services || [])) {
        if (svc.categories && Array.isArray(svc.categories)) {
          svc.categories.forEach((c: string) => { if (c) catSet.add(c) });
        }
        if (svc.category && typeof svc.category === 'string') {
          catSet.add(svc.category);
        }
      }
      const derived = [...catSet].sort((a, b) => a.localeCompare(b)).map(name => ({
        categoryId: `cat-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}`,
        name,
      }));
      return Response.json({ categories: derived });
    }

    categories.sort((a, b) => a.name.localeCompare(b.name));

    return Response.json({ categories });
  } catch (error: any) {
    console.error('Error listing categories:', error);
    return Response.json({ error: 'Failed to load categories' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const client = getClient();

  try {
    const { name } = await request.json();

    if (!name || typeof name !== 'string') {
      return Response.json({ error: 'Category name is required' }, { status: 400 });
    }

    // Get existing category names for validation
    const existingNames: string[] = [];
    let nextToken: string | null = null;
    do {
      const result = await client.models.ServiceCategory.list({
        ...(nextToken ? { nextToken } : {}),
      } as any);
      if (result.data) {
        for (const cat of result.data) {
          if (cat.name) existingNames.push(cat.name);
        }
      }
      nextToken = (result as any).nextToken;
    } while (nextToken);

    // Validate
    const validation = validateCategoryName(name, existingNames);
    if (!validation.valid) {
      return Response.json({ error: validation.error }, { status: 400 });
    }

    const trimmed = name.trim();
    const categoryId = `cat-${trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}`;

    const { data, errors } = await client.models.ServiceCategory.create({
      categoryId,
      name: trimmed,
      createdAt: new Date().toISOString(),
    });

    if (errors) {
      return Response.json({ error: 'Failed to create category', details: errors }, { status: 500 });
    }

    return Response.json({ category: data }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating category:', error);
    return Response.json({ error: 'Failed to create category' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const client = getClient();

  try {
    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get('categoryId');

    if (!categoryId) {
      return Response.json({ error: 'categoryId is required' }, { status: 400 });
    }

    const { errors } = await client.models.ServiceCategory.delete({ categoryId });

    if (errors) {
      return Response.json({ error: 'Failed to delete category', details: errors }, { status: 500 });
    }

    return Response.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting category:', error);
    return Response.json({ error: 'Failed to delete category' }, { status: 500 });
  }
}
