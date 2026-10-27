import { createCompletefulClient, type CompletefulOperationTypes, type CompletefulCallOptions } from '../../src/index.js';

const client=createCompletefulClient({apiKey:'capp_test_example'});
const mockup=client.api.mockups.render({
  body:{mockup_id:'catalog-mockup-id',art_url:'https://cdn.example.com/art.png',
    output:{format:'png',max_size:1800,clip_to_print_area:true}},
});
mockup.then(result=>{
  const status: 'queued'|'running'|'succeeded'|'failed'=result.data.status;
  const job: string=result.data.render_id;
  void status;void job;
});
client.api.catalog.mockups({path:{productId:'catalog-id'},query:{print_location_id:'front'}});
client.api.products.create({path:{shopId:'shop-id'},body:{
  catalog_product_id:'catalog-id',title:'Example Tee',retail_price:25,
  variants:{include:'all'},
}});
const options:CompletefulCallOptions<'mockups.render'>={body:{mockup_id:'id',art_url:'https://cdn.example.com/p.png'}};
const responseType:CompletefulOperationTypes['mockups.render']['response']['status']='succeeded';
void options;void responseType;
// @ts-expect-error mockup_id is required, not optional
client.api.mockups.render({body:{art_url:'https://cdn.example.com/p.png'}});
// @ts-expect-error unknown format must not pass
client.api.mockups.render({body:{mockup_id:'id',art_url:'https://cdn.example.com/p.png',output:{format:'webp'}}});
// @ts-expect-error productId must be supplied
client.api.catalog.mockups({});
// @ts-expect-error shopId must be supplied
client.api.products.create({body:{catalog_product_id:'id',title:'Shirt',retail_price:25}});
// @ts-expect-error query search supports specified provider params only
client.api.catalog.mockups({path:{productId:'id'},query:{arbitrary:true}});
