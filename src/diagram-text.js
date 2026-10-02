// Thai combining marks and Latin words must survive wrapping intact.
const segmenter=new Intl.Segmenter('th',{granularity:'word'});
export function diagramLines(value,limit=68){
  return String(value).split('\n').flatMap(line=>{
    const rows=[];let row='';
    for(const {segment}of segmenter.segment(line)){
      if(row&&Array.from(row+segment).length>limit){rows.push(row);row='';}
      if(Array.from(segment).length>limit){
        for(const {segment:g}of new Intl.Segmenter('th',{granularity:'grapheme'}).segment(segment)){
          if(row&&Array.from(row+g).length>limit){rows.push(row);row='';}row+=g;
        }
      }else row+=segment;
    }
    if(row||!rows.length)rows.push(row);return rows;
  });
}
