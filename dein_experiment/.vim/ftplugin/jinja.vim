setlocal ts=2
setlocal sw=2
setlocal sts=2

" Copied from https://github.com/marionline/dotvim/blob/master/eclim/ftplugin/htmljinja.vim
let g:HtmlJinjaBodyElements = [
    \ ['block', 'endblock'],
    \ ['call', 'endcall'],
    \ ['filter', 'endfilter'],
    \ ['for', 'endfor'],
    \ ['if', 'elif', 'else', 'endif'],
    \ ['macro', 'endmacro'],
  \ ]
" excluding 'else' on for until matchit.vim can support a duplicate word
" (doesn't break the matching of 'else' for 'if' statements.
"    \ ['for', 'else', 'endfor'],

" add matchit.vim support for jinja tags
if !exists('b:match_words')
    let b:match_words = '<:>,<\@<=[ou]l\>[^>]*\%(>\|$\):<\@<=li\>:<\@<=/[ou]l>,<\@<=dl\>[^>]*\%(>\|$\):<\@<=d[td]\>:<\@<=/dl>,<\@<=\([^/][^ \t>]*\)[^>]*\%(>\|$\):<\@<=/\1>'
endif
for element in g:HtmlJinjaBodyElements
let pattern = ''
for tag in element[:-2]
  if pattern != ''
    let pattern .= ':'
  endif
  let pattern .= '{%-\?\s*\<' . tag . '\>' "\_.\{-}-\?%}'
endfor
let pattern .= ':{%-\?\s*\<' . element[-1:][0] . '\>\s*-\?%}'
let b:match_words .= ',' . pattern
endfor
