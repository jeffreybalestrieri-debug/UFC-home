source("ufc_scraper.R")

result <- get_all_odds(
  fight_date = c("2026-05-02", "2026-05-03"),
  sportsbook = "draftkings",
  markets    = c("fight_time") ## mov, rounds, fight_time
)

result

write.csv(result, 'test.csv', row.names=F)

appearances <- read.csv('~/Downloads/appearance_export (50).csv')


name_dictionary <- c(
  ## admin name == oj name
  "Darya Zheleznyakova" = "Daria Zhelezniakova",
  "Norma Dumont Viana" = 'Norma Dumont',
  "Ana Talita de Oliviera Alencar" = 'Talita Alencar'
)


test <- result %>% 
  mutate(fighter = if_else(fighter %in% name_dictionary, 
                           names(name_dictionary)[match(fighter, name_dictionary)], 
                           fighter),
         fighter_new = tolower(fighter),
         under_decimal_odds = ifelse(is.na(under_decimal_odds), "", under_decimal_odds),
         is_alt = ifelse(is_alt, is_alt, ""),
         under_decimal_odds = ifelse(over_decimal_odds > 4, "", under_decimal_odds)) %>% 
  left_join(appearances %>% 
            mutate(player_new = tolower(player_name)), 
            by = c('fighter_new' = 'player_new')) %>% 
  rename('stat_name' = 'odds_name') %>% 
  select(player_name, appearance_id, stat_name, is_alt, stat_value, over_decimal_odds, under_decimal_odds) %>% 
  mutate(line_replacement = TRUE,
         under_decimal_odds = ifelse(under_decimal_odds > 1.25, under_decimal_odds, ""),
         over_decimal_odds = ifelse(over_decimal_odds > 1.25, over_decimal_odds, ""))

length(unique(test$player_name))

table(test$player_name)

write.csv(test, '~/Desktop/bulk_upload.csv', row.names=F)


test %>% 
  filter(player_name == 'Robert Bryczek')
