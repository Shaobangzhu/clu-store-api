import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module';

type GraphQLResponse<T> = {
  data: T;
};

type HelloQueryResponse = {
  hello: string;
};

type HealthQueryResponse = {
  health: {
    status: string;
    dependencies: Array<{
      name: string;
      isHealthy: boolean;
    }>;
  };
};

describe('GraphQL App (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('returns hello query result', async () => {
    const query = {
      query: `
        query {
          hello
        }
      `,
    };

    const server = app.getHttpServer() as Parameters<typeof request>[0];

    const response = await request(server)
      .post('/graphql')
      .send(query)
      .expect(200);

    const body = response.body as GraphQLResponse<HelloQueryResponse>;

    expect(body.data.hello).toBe('GraphQL is ready');
  });

  it('returns health query result', async () => {
    const query = {
      query: `
        query {
          health {
            status
            dependencies {
              name
              isHealthy
            }
          }
        }
      `,
    };

    const server = app.getHttpServer() as Parameters<typeof request>[0];

    const response = await request(server)
      .post('/graphql')
      .send(query)
      .expect(200);

    const body = response.body as GraphQLResponse<HealthQueryResponse>;

    expect(body.data.health.status).toBeDefined();
    expect(Array.isArray(body.data.health.dependencies)).toBe(true);
    expect(body.data.health.dependencies.length).toBeGreaterThan(0);

    expect(body.data.health.dependencies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'application',
          isHealthy: true,
        }),
      ]),
    );
  });

  afterEach(async () => {
    await app.close();
  });
});
